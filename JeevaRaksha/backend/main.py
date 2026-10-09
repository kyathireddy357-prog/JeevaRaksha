import hashlib, hmac, os, pathlib, re, secrets, sqlite3, uuid
from contextlib import closing
import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = pathlib.Path(__file__).parent
DB, UP = BASE / "jeevaraksha.db", BASE / "uploads"
UP.mkdir(exist_ok=True)
app = FastAPI(title="JeevaRaksha")

def db():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row; return c

with closing(db()) as c:
    c.executescript("""
    create table if not exists users(id integer primary key, name text, email text unique, mobile text, pw text,
      emergency_number text default '112', contact_name text default '', contact_phone text default '');
    create table if not exists sessions(token text primary key, user_id integer, created_at text default current_timestamp);
    create table if not exists activity(id integer primary key, user_id integer, kind text, title text, detail text, created_at text default current_timestamp);
    create table if not exists reports(id integer primary key, user_id integer, filename text, stored text, mime text, size integer, created_at text default current_timestamp);
    """); c.commit()

def hash_pw(p, salt=None):
    salt = salt or os.urandom(16)
    return salt.hex() + ":" + hashlib.scrypt(p.encode(), salt=salt, n=2**14, r=8, p=1).hex()
def check_pw(p, stored):
    s, h = stored.split(":")
    return hmac.compare_digest(hash_pw(p, bytes.fromhex(s)).split(":")[1], h)

def me(request: Request):
    with closing(db()) as c:
        u = c.execute("select u.* from sessions s join users u on u.id=s.user_id where s.token=? and s.created_at>datetime('now','-7 days')",
                      (request.cookies.get("sid"),)).fetchone()
    if not u: raise HTTPException(401, "Please log in.")
    return u

def log(uid, kind, title, detail=""):
    with closing(db()) as c:
        c.execute("insert into activity(user_id,kind,title,detail) values(?,?,?,?)", (uid, kind, title, detail)); c.commit()

def public(u): return {k: u[k] for k in ("id", "name", "email", "mobile", "emergency_number", "contact_name", "contact_phone")}

class Reg(BaseModel):
    name: str = Field(min_length=2, max_length=80); email: str = Field(max_length=120)
    mobile: str = Field("", max_length=16); password: str = Field(min_length=8, max_length=128)
class Login(BaseModel): email: str; password: str
class Prof(BaseModel):
    name: str = Field(min_length=2, max_length=80); mobile: str = Field("", max_length=16)
    emergency_number: str = Field(max_length=16); contact_name: str = Field("", max_length=80); contact_phone: str = Field("", max_length=16)
class Chat(BaseModel): message: str = Field(min_length=1, max_length=1000)
class Sym(BaseModel):
    symptoms: list[str] = Field(min_length=1, max_length=20); other: str = Field("", max_length=200)
    duration: str; severity: str

PHONE = re.compile(r"^\+?\d{7,15}$")
@app.post("/api/register")
def register(b: Reg, r: Response):
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", b.email): raise HTTPException(400, "Enter a valid email address.")
    if b.mobile and not PHONE.match(b.mobile): raise HTTPException(400, "Mobile number must be 7 to 15 digits.")
    with closing(db()) as c:
        try: cur = c.execute("insert into users(name,email,mobile,pw) values(?,?,?,?)", (b.name.strip(), b.email.lower(), b.mobile, hash_pw(b.password)))
        except sqlite3.IntegrityError: raise HTTPException(400, "An account with this email already exists.")
        c.commit(); return start(cur.lastrowid, r)

def start(uid, r):
    t = secrets.token_urlsafe(32)
    with closing(db()) as c:
        c.execute("insert into sessions(token,user_id) values(?,?)", (t, uid)); c.commit()
    r.set_cookie("sid", t, httponly=True, samesite="lax", max_age=7 * 86400)  # add secure=True behind HTTPS
    return {"ok": True}

@app.post("/api/login")
def login(b: Login, r: Response):
    with closing(db()) as c: u = c.execute("select * from users where email=?", (b.email.lower(),)).fetchone()
    if not u or not check_pw(b.password, u["pw"]): raise HTTPException(401, "Incorrect email or password.")
    return start(u["id"], r)

@app.post("/api/logout")
def logout(request: Request, r: Response):
    with closing(db()) as c:
        c.execute("delete from sessions where token=?", (request.cookies.get("sid"),)); c.commit()
    r.delete_cookie("sid"); return {"ok": True}

@app.get("/api/me")
def get_me(u=Depends(me)): return public(u)

@app.put("/api/me")
def put_me(b: Prof, u=Depends(me)):
    if b.mobile and not PHONE.match(b.mobile): raise HTTPException(400, "Mobile number must be 7 to 15 digits.")
    if not re.match(r"^\+?\d{2,15}$", b.emergency_number): raise HTTPException(400, "Emergency number must contain digits only.")
    if b.contact_phone and not PHONE.match(b.contact_phone): raise HTTPException(400, "Contact phone must be 7 to 15 digits.")
    with closing(db()) as c:
        c.execute("update users set name=?,mobile=?,emergency_number=?,contact_name=?,contact_phone=? where id=?",
                  (b.name.strip(), b.mobile, b.emergency_number, b.contact_name, b.contact_phone, u["id"])); c.commit()
    return {"ok": True}

SYSTEM = ("You are JeevaRaksha's health information assistant. Give cautious, general, plain-language information. "
          "You are not a doctor and cannot diagnose. Never recommend prescription medicines or doses. "
          "For possible emergencies, tell the user to contact local emergency services immediately.")
@app.post("/api/chat")
async def chat(b: Chat, u=Depends(me)):
    log(u["id"], "chat", b.message[:80], b.message)
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return {"demo": True, "reply": "This is a demo reply because no AI service is configured. Set ANTHROPIC_API_KEY on the server to enable real answers. "
                "For any urgent symptom, contact a doctor or your local emergency number."}
    try:
        async with httpx.AsyncClient(timeout=30) as h:
            r = await h.post("https://api.anthropic.com/v1/messages", headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                json={"model": os.getenv("AI_MODEL", "claude-sonnet-4-6"), "max_tokens": 600, "system": SYSTEM, "messages": [{"role": "user", "content": b.message}]})
        r.raise_for_status(); return {"demo": False, "reply": r.json()["content"][0]["text"]}
    except Exception: raise HTTPException(502, "The AI service could not be reached. Please try again later.")

RED = {"chest pain", "difficulty breathing", "confusion", "severe bleeding", "fainting", "seizure", "one-sided weakness"}
@app.post("/api/symptoms")
def symptoms(b: Sym, u=Depends(me)):
    if b.duration not in ("Under 2 days", "2 to 7 days", "Over a week") or b.severity not in ("Mild", "Moderate", "Severe"):
        raise HTTPException(400, "Choose a valid duration and severity.")
    emergency = any(s.lower() in RED for s in b.symptoms)
    summary = f"{', '.join(b.symptoms)}{'; ' + b.other if b.other else ''}. Duration: {b.duration}. Severity: {b.severity}."
    if emergency: advice = "One or more of these symptoms can signal a medical emergency. Contact your local emergency service now."
    elif b.severity == "Severe" or b.duration == "Over a week": advice = "Please arrange to see a doctor soon. Seek urgent care if you get worse."
    else: advice = "Rest, drink fluids and monitor your symptoms. See a clinician if they continue or worsen."
    log(u["id"], "symptoms", ", ".join(b.symptoms)[:80], summary)
    return {"summary": summary, "emergency": emergency, "advice": advice,
            "note": "Rule-based educational guidance only. It is not AI analysis and not a diagnosis."}

@app.get("/api/history")
def history(q: str = "", limit: int = 100, u=Depends(me)):
    with closing(db()) as c:
        rows = c.execute("select id,kind,title,detail,created_at from activity where user_id=? and (title like ? or detail like ?) order by id desc limit ?",
                         (u["id"], f"%{q}%", f"%{q}%", min(limit, 200))).fetchall()
    return [dict(r) for r in rows]
@app.delete("/api/history/{i}")
def del_one(i: int, u=Depends(me)):
    with closing(db()) as c: c.execute("delete from activity where id=? and user_id=?", (i, u["id"])); c.commit()
    return {"ok": True}
@app.delete("/api/history")
def del_all(u=Depends(me)):
    with closing(db()) as c: c.execute("delete from activity where user_id=?", (u["id"],)); c.commit()
    return {"ok": True}

MAGIC = {b"%PDF": "application/pdf", b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg"}
@app.post("/api/reports")
async def upload(file: UploadFile = File(...), u=Depends(me)):
    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024: raise HTTPException(413, "File is larger than 5 MB.")
    mime = next((m for k, m in MAGIC.items() if data.startswith(k)), None)
    if not mime: raise HTTPException(400, "Only PDF, PNG or JPG files are allowed.")
    sid = uuid.uuid4().hex; (UP / sid).write_bytes(data)
    name = pathlib.Path(file.filename or "report").name[:100]
    with closing(db()) as c:
        c.execute("insert into reports(user_id,filename,stored,mime,size) values(?,?,?,?,?)", (u["id"], name, sid, mime, len(data))); c.commit()
    log(u["id"], "report", f"Uploaded {name}")
    return {"ok": True}
@app.get("/api/reports")
def reports(u=Depends(me)):
    with closing(db()) as c: rows = c.execute("select id,filename,size,created_at from reports where user_id=? order by id desc", (u["id"],)).fetchall()
    return [dict(r) for r in rows]
def own(i, u):
    with closing(db()) as c: r = c.execute("select * from reports where id=? and user_id=?", (i, u["id"])).fetchone()
    if not r: raise HTTPException(404, "Report not found.")
    return r
@app.get("/api/reports/{i}/file")
def report_file(i: int, u=Depends(me)):
    r = own(i, u); return FileResponse(UP / r["stored"], media_type=r["mime"], filename=r["filename"])
@app.delete("/api/reports/{i}")
def del_report(i: int, u=Depends(me)):
    r = own(i, u); (UP / r["stored"]).unlink(missing_ok=True)
    with closing(db()) as c: c.execute("delete from reports where id=?", (i,)); c.commit()
    return {"ok": True}

app.mount("/", StaticFiles(directory=BASE.parent / "frontend", html=True), name="site")
