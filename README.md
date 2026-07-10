# 📋 Modern Task Management Dashboard

A sleek, highly interactive, and production-ready **Task Management Dashboard** designed with absolute focus on usability, fluid visual design, and clean architecture.

This full-stack application provides robust user authentication, an elegant dashboard viewport, multi-view task filters, detailed activity transaction feeds, and direct relational SQLite3 schema synchronization.

---

## 🎨 Interface Preview

Below is a preview mockup of the high-fidelity, responsive user interface designed with a premium, accessible aesthetic:

![Task Management Dashboard Mockup](src/assets/images/dashboard_mockup_1783679955956.jpg)

---

## ✨ Features

- **🔐 Dual-State Authentication**: Real login and registration system with secure password hashing and stateful browser session persistence.
- **📅 Dynamic Task Management & Calendar View**: Easily create, update, check off, and delete tasks. View scheduled items seamlessly on an interactive calendar widget.
- **⚡ Interactive Filter Engine**: Instant client-side search query parsing, priority segregation (Low, Medium, High), status categorization (Pending, Completed), and time period segmentation.
- **🌓 Adaptive Theme Modes**: Instant one-click toggle between standard high-contrast light mode (Warm Off-white & Amber accents) and an eye-safe slate dark mode.
- **📊 Real-time Analytics Dashboard**: Live task counts, performance metric cards, completion ratios, and dynamic activity charts.
- **📂 Live SQLite3 Schema Explorer**: Real-time table analyzer showing integrated relational state tables (`tasks` and `users`) directly from the underlying SQLite3 system.
- **🔔 Action Confirmation Modals**: Secure destructive actions (like task deletion or logging out) behind customized, elegant animated modals to prevent accidental loss of user state.

---

## 🛠️ Technology Stack

### **Frontend**
* **Core**: Modern HTML5, ES6+ JavaScript, DOM Manipulation.
* **Styling**: Tailwind CSS (via modern compiled stylesheet integration).
* **Icons**: [Lucide Icons](https://lucide.dev/) for clean, scale-independent vector icons.
* **Transitions**: Micro-interactions, slide-outs, and modal fade scales via standard Tailwind transition animations.

### **Backend**
* **Core**: Python 3 standard library `http.server` providing a lightweight, low-overhead HTTP REST service.
* **Database**: SQLite3 (`sqlite3`) storing user data and task records securely locally with transactional query safety.
* **Execution**: Automated runtime dependency management using `npm` wrappers for python commands.

---

## 💾 Database Schema

The SQLite3 relational database (`tasks.db`) manages two main tables:

### 1. `users` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `user_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique user identifier |
| `employee_name` | `TEXT` | `NOT NULL` | The full name of the registered employee |
| `username` | `TEXT` | `UNIQUE NOT NULL` | System login credential |
| `password_hash` | `TEXT` | `NOT NULL` | Hashed password string |

### 2. `tasks` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `task_id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique task identifier |
| `user_id` | `INTEGER` | `FOREIGN KEY` references `users(user_id)` | Owner identifier |
| `title` | `TEXT` | `NOT NULL` | Title of the task |
| `description` | `TEXT` | | Optional rich description text |
| `due_date` | `TEXT` | | Due date stored as ISO YYYY-MM-DD |
| `priority` | `TEXT` | | `Low`, `Medium`, or `High` |
| `status` | `TEXT` | `DEFAULT 'pending'` | `pending` or `completed` |
| `category` | `TEXT` | `DEFAULT 'Work'` | Categorized type of activity |
| `repeat` | `TEXT` | `DEFAULT 'None'` | Recurrence pattern |
| `reminder` | `TEXT` | `DEFAULT 'None'` | Trigger state |
| `employee_name` | `TEXT` | | Cached name of assigned owner |
| `created_at` | `TEXT` | | Creation timestamp |
| `completed_date` | `TEXT` | | Task completion timestamp |

---

## 📡 API Endpoints Reference

All API endpoints return standard `application/json` payloads.

### **Authentication**
* **`POST /api/register`**: Registers a new user. Expects `employee_name`, `username`, and `password`.
* **`POST /api/login`**: Authenticates credentials. Returns user object on success.

### **Task Management**
* **`GET /api/tasks`**: Fetches all tasks assigned to the authenticated user.
* **`POST /api/tasks`**: Creates a new task.
* **`PUT /api/tasks/:id`**: Updates an existing task (e.g., status, description, title).
* **`DELETE /api/tasks/:id`**: Permanently deletes a task.

### **Database Monitoring**
* **`GET /api/db/tables`**: Queries internal SQLite tables (`users`, `tasks`) and returns serialized datasets for monitoring.

---

## 🚀 Getting Started

### **Prerequisites**
- Ensure you have **Python 3** and **Node.js/npm** installed on your server environment.

### **Development Run**
1. Run the local development server:
   ```bash
   npm run dev
   ```
2. Open your preferred browser and navigate to:
   ```
   http://localhost:3000
   ```

### **Production Deployment**
Compile frontend resources and launch Python directly:
```bash
npm run build
npm start
```
