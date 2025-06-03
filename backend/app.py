import datetime
from fastapi import FastAPI, Form, Request

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Annotated, List, Optional
from pymongo import MongoClient
import os


app = FastAPI()

# Add CORS middleware
origins = [
    "https://tabor.lutheran.sk",
    "http://localhost:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get MongoDB connection string from environment variables
MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017/")

# Initialize MongoDB client
client = MongoClient(MONGO_CONNECTION_STRING)
db = client["family_camp"]
registration_collection = db["registration"]


class FamilyMember(BaseModel):
    name: str
    age: int


class Registration(BaseModel):
    first_name: str
    last_name: str
    age: int
    email: str
    phone: str
    attendance: str
    registration_time: datetime = datetime.datetime.now()
    days: Optional[List[int]] = None
    family_members: Optional[List[FamilyMember]] = None
    note: Optional[str] = None

    model_config = {"arbitrary_types_allowed": True}


@app.post("/api/register")
async def register(
    first_name: Annotated[str, Form(alias="firstName")],
    last_name: Annotated[str, Form(alias="lastName")],
    age: Annotated[int, Form(...)],
    email: Annotated[str, Form(...)],
    phone: Annotated[str, Form(...)],
    attendance: Annotated[str, Form(...)],
    days: Annotated[Optional[List[int]], Form()] = None,
    family_members: Annotated[Optional[List[FamilyMember]], Form(alias="familyMembers")] = None,
    note: Annotated[Optional[str], Form()] = None,
    request: Request = None,  # Add this parameter
):

    if note == "":
        note = None

    form = await request.form()
    family_members = []
    index = 0

    while f"familyMembers.{index}.name" in form and f"familyMembers.{index}.age" in form:
        family_member = FamilyMember(
            name=form[f"familyMembers.{index}.name"], age=int(form[f"familyMembers.{index}.age"])
        )
        family_members.append(family_member)
        index += 1

    registration = Registration(
        first_name=first_name,
        last_name=last_name,
        age=age,
        email=email,
        phone=phone,
        attendance=attendance,
        days=days,
        family_members=family_members,
        note=note,
    )

    # Save to MongoDB
    registration_data = registration.model_dump(exclude_none=True)
    registration_collection.insert_one(registration_data)

    return {"message": "Registration successful!"}


@app.get("/api/attendees", response_class=HTMLResponse)
async def attendees_list():
    """
    Get the list of all attendees as an HTML table.
    """
    registrations_cursor = registration_collection.find()
    attendees = [Registration.model_validate(attendee) for attendee in registrations_cursor]

    html = "<table border='1'>\n"
    html += "<tr><th>ID</th><th>Name</th><th>Age</th><th>Email</th><th>Phone</th><th>Attendance</th><th>Days</th><th>Note</th></tr>\n"

    attendee_id = 1
    for i, attendee in enumerate(attendees):
        row_class = " style='background-color:#e8f3ff;'" if i % 2 == 1 else ""
        html += (
            f"<tr{row_class}>"
            f"<td>{attendee_id}</td>"
            f"<td>{attendee.first_name} {attendee.last_name}</td>"
            f"<td>{attendee.age}</td>"
            f"<td>{attendee.email}</td>"
            f"<td>{attendee.phone}</td>"
            f"<td>{attendee.attendance}</td>"
            f"<td>{', '.join(map(str, attendee.days)) if attendee.days else ''}</td>"
            f"<td>{attendee.note if attendee.note else ''}</td>"
            "</tr>\n"
        )
        attendee_id += 1
        for member in attendee.family_members or []:
            html += (
                f"<tr{row_class}>"
                f"<td>{attendee_id}</td>"
                f"<td>{member.name}</td>"
                f"<td>{member.age}</td>"
                "<td /><td /><td /><td /><td />"
                "</tr>\n"
            )
            attendee_id += 1

    html += "</table>\n"
    return html


@app.get("/liveness/", status_code=200)
def liveness_check():
    return "Liveness check succeeded."


@app.get("/readiness/", status_code=200)
def readiness_check():
    return "Readiness check succeeded."


@app.get("/startup/", status_code=200)
def startup_check():
    return "Startup check succeeded."


# if __name__ == "__main__":
# import uvicorn

#     uvicorn.run(app, host="localhost", port=8000)
