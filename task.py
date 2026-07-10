import sqlite3
import datetime
import json

DB_PATH = './tasks.db'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def handle_add_task(data):
    user_id = data.get('user_id')
    title = data.get('title')
    description = data.get('description', '')
    due_date = data.get('due_date', '')
    priority = data.get('priority', 'medium')
    status = data.get('status', 'pending')
    category = data.get('category', 'Work')
    repeat = data.get('repeat', 'None')
    reminder = data.get('reminder', 'None')
    employee_name = data.get('employee_name', '')
    task_id = data.get('task_id')

    if not user_id or not title:
        return 400, {"detail": "Missing required fields (user_id and title)"}

    created_at = datetime.date.today().isoformat()
    completed_date = created_at if status == 'completed' else None

    conn = get_db()
    cursor = conn.cursor()
    try:
        if task_id is not None:
            # Check if this task_id already exists to prevent duplicate key errors, generate random fallback if yes
            cursor.execute('SELECT task_id FROM tasks WHERE task_id = ?', (task_id,))
            if cursor.fetchone():
                import random
                task_id = random.randint(10000, 99999)
            
            cursor.execute("""
                INSERT INTO tasks (
                    task_id, user_id, title, description, due_date, priority, status, category, repeat, reminder, employee_name, created_at, completed_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                task_id, user_id, title, description, due_date, priority, status, category, repeat, reminder, employee_name, created_at, completed_date
            ))
        else:
            cursor.execute("""
                INSERT INTO tasks (
                    user_id, title, description, due_date, priority, status, category, repeat, reminder, employee_name, created_at, completed_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, title, description, due_date, priority, status, category, repeat, reminder, employee_name, created_at, completed_date
            ))
            task_id = cursor.lastrowid
        conn.commit()
        return 200, {
            "message": "Task Added Successfully",
            "task_id": task_id
        }
    except Exception as e:
        print("Add task error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()

def handle_get_tasks(user_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.*, u.username 
            FROM tasks t 
            LEFT JOIN users u ON t.user_id = u.user_id 
            WHERE t.user_id = ? 
            ORDER BY t.task_id DESC
        """, (user_id,))
        rows = cursor.fetchall()
        tasks = [dict(row) for row in rows]
        return 200, tasks
    except Exception as e:
        print("Get tasks error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()

def handle_update_status(task_id, data):
    status = data.get('status')
    if not status:
        return 400, {"detail": "Missing status field"}

    completed_date = datetime.date.today().isoformat() if status == 'completed' else None

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('UPDATE tasks SET status = ?, completed_date = ? WHERE task_id = ?', (status, completed_date, task_id))
        conn.commit()
        return 200, {"message": "Status Updated"}
    except Exception as e:
        print("Update task error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()

def handle_delete_task(task_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM tasks WHERE task_id = ?', (task_id,))
        conn.commit()
        return 200, {"message": "Task Deleted"}
    except Exception as e:
        print("Delete task error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()

def handle_get_all_tables():
    """Fetches full content of users and tasks tables for visual database explorer in the UI."""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT user_id, employee_name, username FROM users ORDER BY user_id DESC')
        users = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
            SELECT t.*, u.username 
            FROM tasks t 
            LEFT JOIN users u ON t.user_id = u.user_id 
            ORDER BY t.task_id DESC
        """)
        tasks = [dict(row) for row in cursor.fetchall()]

        return 200, {
            "users": users,
            "tasks": tasks
        }
    except Exception as e:
        print("Get all tables error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()

def handle_custom_query(data):
    """Executes a custom SQL query directly on the SQLite3 database and returns structured results."""
    query = data.get('query', '')
    if not query:
        return 400, {"detail": "Query cannot be empty."}

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(query)
        is_select = query.strip().upper().startswith(('SELECT', 'PRAGMA', 'EXPLAIN', 'WITH'))
        if is_select:
            rows = cursor.fetchall()
            results = [dict(row) for row in rows]
            columns = list(rows[0].keys()) if rows else []
            conn.commit()
            return 200, {
                "columns": columns,
                "rows": results,
                "row_count": len(results),
                "is_select": True
            }
        else:
            conn.commit()
            affected = cursor.rowcount
            return 200, {
                "message": f"Query executed successfully. Affected rows: {affected}",
                "columns": [],
                "rows": [],
                "row_count": 0,
                "is_select": False
            }
    except Exception as e:
        return 400, {"detail": str(e)}
    finally:
        conn.close()

def handle_get_tasks_by_date(user_id, due_date):

    conn = get_db()
    cursor = conn.cursor()

    try:

        cursor.execute("""
            SELECT *
            FROM tasks
            WHERE user_id = ?
            AND due_date = ?
            ORDER BY task_id DESC
        """, (user_id, due_date))

        rows = cursor.fetchall()

        tasks = [dict(row) for row in rows]

        return 200, tasks

    except Exception as e:

        print("Date Filter Error:", e)

        return 500, {"detail":"Internal Server Error"}

    finally:

        conn.close()


        


