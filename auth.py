import sqlite3
import hashlib
import json

DB_PATH = './tasks.db'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    # Standard SHA-256 with a secret salt
    salt = "organizo_secure_salt_value_2026!"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def handle_register(data):
    employee_name = data.get('employee_name')
    username = data.get('username')
    password = data.get('password')

    if not employee_name or not username or not password:
        return 400, {"detail": "Missing required fields"}

    conn = get_db()
    cursor = conn.cursor()
    try:
        # Check username
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        if cursor.fetchone():
            return 400, {"detail": "Username already exists"}

        password_hash = hash_password(password)
        cursor.execute(
            'INSERT INTO users (employee_name, username, password_hash) VALUES (?, ?, ?)',
            (employee_name, username, password_hash)
        )
        conn.commit()
        return 200, {"message": "Registration Successful"}
    except Exception as e:
        print("Register error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()

def handle_login(data):
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return 400, {"detail": "Missing username or password"}

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        if not user:
            return 401, {"detail": "Invalid Username"}

        user_dict = dict(user)
        if not verify_password(password, user_dict['password_hash']):
            return 401, {"detail": "Invalid Password"}

        return 200, {
            "message": "Login Successful",
            "user_id": user_dict['user_id'],
            "employee_name": user_dict['employee_name']
        }
    except Exception as e:
        print("Login error:", e)
        return 500, {"detail": "Internal Server Error"}
    finally:
        conn.close()
