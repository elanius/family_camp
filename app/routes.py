from flask import Blueprint, render_template, request
from pymongo import MongoClient

main = Blueprint("main", __name__)

# MongoDB connection setup
client = MongoClient("mongodb://localhost:27017/")
db = client["family_camp"]
registrations = db["registrations"]


@main.route("/")
def index():
    return render_template("index.html")


@main.route("/submit", methods=["POST"])
def submit():
    data = request.form.to_dict(flat=False)

    # Prepare the data for MongoDB
    registration = {
        "name": data.get("name", [""])[0],
        "age": int(data.get("age", [0])[0]),
        "email": data.get("email", [""])[0],
        "telephone": data.get("telephone", [""])[0],
        "household_members": [
            {"name": name, "age": int(age)}
            for name, age in zip(data.get("memberName[]", []), data.get("memberAge[]", []))
        ],
    }

    # Insert into MongoDB
    registrations.insert_one(registration)

    return "Form submitted successfully!"
