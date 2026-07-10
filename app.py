import http.server
import json
import sqlite3
import re
import os
import mimetypes
import urllib.parse

import auth
import task

DB_PATH = './tasks.db'

def setup_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Create Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_name TEXT,
            username TEXT UNIQUE,
            password_hash TEXT
        )
    """)
    # Create Tasks Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            task_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            description TEXT,
            due_date TEXT,
            priority TEXT,
            status TEXT DEFAULT 'pending',
            category TEXT DEFAULT 'Work',
            repeat TEXT DEFAULT 'None',
            reminder TEXT DEFAULT 'None',
            employee_name TEXT,
            created_at TEXT,
            completed_date TEXT
        )
    """)
    conn.commit()
    conn.close()

class APIHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def read_json(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length)
        return json.loads(body.decode('utf-8'))

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_POST(self):
        path = self.path
        
        # Match /register or /api/register
        if path in ('/register', '/api/register'):
            try:
                data = self.read_json()
                status, res = auth.handle_register(data)
                return self.send_json(status, res)
            except Exception as e:
                print("Register POST error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})

        # Match /login or /api/login
        elif path in ('/login', '/api/login'):
            try:
                data = self.read_json()
                status, res = auth.handle_login(data)
                return self.send_json(status, res)
            except Exception as e:
                print("Login POST error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})

        # Match /tasks or /api/tasks
        elif path in ('/tasks', '/api/tasks'):
            try:
                data = self.read_json()
                status, res = task.handle_add_task(data)
                return self.send_json(status, res)
            except Exception as e:
                print("Add task POST error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})

        # Match /api/db/query
        elif path in ('/api/db/query', '/db/query'):
            try:
                data = self.read_json()
                status, res = task.handle_custom_query(data)
                return self.send_json(status, res)
            except Exception as e:
                print("Custom query POST error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})

        else:
            return self.send_json(404, {"detail": "Not Found"})

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # Check for static file requests first (e.g. root or index.html, style.css, script.js)
        # To handle any path beautifully under SPA (except API calls), we can fall back to serving index.html
        if not path.startswith('/api/') and path not in ('/db/tables', '/tasks') and not re.match(r'^/(?:api/)?tasks/(\d+)$', path) and not path.startswith('/db/'):
            file_path = path.lstrip('/')
            if not file_path or file_path == '':
                file_path = 'index.html'
            
            if os.path.exists(file_path) and os.path.isfile(file_path):
                try:
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    mime_type, _ = mimetypes.guess_type(file_path)
                    if mime_type is None:
                        mime_type = 'application/octet-stream'
                    self.send_response(200)
                    self.send_header('Content-Type', mime_type)
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(f"Error reading file {file_path}: {str(e)}".encode('utf-8'))
                    return
            else:
                # SPA Fallback: serve index.html
                try:
                    with open('index.html', 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(f"Error reading index.html: {str(e)}".encode('utf-8'))
                    return

        # Match /db/tables or /api/db/tables
        if path in ('/db/tables', '/api/db/tables'):
            try:
                status, res = task.handle_get_all_tables()
                return self.send_json(status, res)
            except Exception as e:
                print("Get db tables error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})
        

        # Match /tasks/date/<user_id>/<due_date>
        match = re.match(
            r'^/(?:api/)?tasks/date/(\d+)/(\d{4}-\d{2}-\d{2})$',
            path
        )

        if match:
            try:
                user_id = int(match.group(1))
                due_date = match.group(2)

                status, res = task.handle_get_tasks_by_date(
                    user_id,
                    due_date
                )
                return self.send_json(status, res)

            except Exception as e:
                print("Get tasks by date error:", e)
                return self.send_json(
                    500,
                    {"detail": "Internal Server Error"}
                )

        # Match /tasks/<user_id> or /api/tasks/<user_id>
        match = re.match(r'^/(?:api/)?tasks/(\d+)$', path)
        if match:
            try:
                user_id = int(match.group(1))
                status, res = task.handle_get_tasks(user_id)
                return self.send_json(status, res)
            except Exception as e:
                print("Get tasks error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})
        
        return self.send_json(404, {"detail": "Not Found"})

    def do_PUT(self):
        path = self.path
        
        # Match /tasks/<task_id> or /api/tasks/<task_id>
        match = re.match(r'^/(?:api/)?tasks/(\d+)$', path)
        if match:
            try:
                task_id = int(match.group(1))
                data = self.read_json()
                status, res = task.handle_update_status(task_id, data)
                return self.send_json(status, res)
            except Exception as e:
                print("Update task status error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})
        
        return self.send_json(404, {"detail": "Not Found"})

    def do_DELETE(self):
        path = self.path
        
        # Match /tasks/<task_id> or /api/tasks/<task_id>
        match = re.match(
            r'^/(?:api/)?tasks/(\d+)$', 
            path
        )
        if match:
            try:
                task_id = int(match.group(1))
                status, res = task.handle_delete_task(task_id)
                return self.send_json(status, res)
            except Exception as e:
                print("Delete task error:", e)
                return self.send_json(500, {"detail": "Internal Server Error"})
        
        return self.send_json(404, {"detail": "Not Found"})

def run():
    setup_db()
    server_address = ('0.0.0.0', 3000)
    httpd = http.server.HTTPServer(server_address, APIHandler)
    print("Python Server running on http://0.0.0.0:3000")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
