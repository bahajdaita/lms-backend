# 📚 LMS Backend

This repository contains the **backend** of the Learning Management System (LMS).  
It is built with **Node.js**, **Express.js**, and **PostgreSQL** using an MVC architecture and raw SQL queries.

---

## 🔧 Tech Stack
| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js (v18 +) |
| **Framework** | Express.js |
| **Database** | PostgreSQL |
| **Auth** | JWT + Google OAuth 2.0 |
| **File Uploads** | Multer |
| **Security** | Helmet, CORS, Rate-Limiter |
| **Logging** | Morgan |
| **Testing** | Postman collections |

---

## 📁 Project Structure
lms-backend/
│
├── controllers/ # Route logic / request handlers
├── models/ # Raw SQL queries + DB helpers
├── routes/ # Express routers (versioned under /api)
├── middleware/ # Auth, error-handling, validation
├── utils/ # Constants, helper functions
├── uploads/ # Stored files (avatars, submissions)
├── .env.example # Sample environment variables
├── server.js # App entry point
└── README.md

yaml
Copy
Edit

---

## 🚀 Features
- **Role-Based Access Control** (Student / Instructor / Admin)
- **Course lifecycle** (create ➜ review ➜ publish)
- **Module & Lesson management**
- **Quizzes** (MCQ, True/False, Text) with auto-grading
- **Assignments & Submissions** with file upload
- **Student Enrollment & Progress tracking**
- **Admin dashboard** for analytics

---

## 🛠️ Setup & Run

1. **Clone** and install dependencies
   ```bash
   git clone https://github.com/yourusername/lms-backend.git
   cd lms-backend
   npm install
Configure environment variables

Create a .env file based on .env.example:

env
Copy
Edit
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/lms
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=yyy
Run migrations / seed (if you have SQL scripts)

bash
Copy
Edit
npm run migrate   # optional
npm run seed      # optional
Start the server

bash
Copy
Edit
npm start        # production
npm run dev      # nodemon (development)
The API will be available at http://localhost:3001/api

📬 Key Endpoints (v1)
Method	Endpoint	Description
POST	/auth/register	Email sign-up
POST	/auth/login	Email login
GET	/auth/google	Google OAuth start
GET	/courses	List public courses
POST	/courses	Create course (Requires Instructor)
POST	/enrollments	Enroll student in a course
POST	/quizzes	Add quiz (Instructor)
POST	/assignments	Add assignment (Instructor)

All protected routes require: Authorization: Bearer <JWT>.

🧪 Testing
Import postman_collection.json in the root into Postman.

Environment variables {{base_url}} and {{token}} are pre-configured.

🗺️ Deployment Guide (short)
bash
Copy
Edit
# Build (if using TypeScript / Babel)
npm run build

# Deploy to Render / Railway / Heroku
git push render main
(ensure DATABASE_URL & JWT_SECRET are set in the service dashboard).

🖋️ License
MIT © 2025 Baha Fareed Turki Jdaitawi

👤 Author
Baha Fareed Turki Jdaitawi
Hussein Technical University — Upskilling Program
GitHub • LinkedIn
