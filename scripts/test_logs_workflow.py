import requests
import json
import sys
import os

# Reconfigure stdout to force UTF-8 output on Windows terminal
sys.stdout.reconfigure(encoding='utf-8')

def load_env():
    env_path = r"c:\Users\ohmyg\OneDrive\Desktop\AI facilitator\facilitator-api\.env.local"
    supabase_url = None
    supabase_key = None
    
    if not os.path.exists(env_path):
        print(f"Error: env file not found at {env_path}")
        sys.exit(1)
        
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith("SUPABASE_URL="):
                supabase_url = line.split("=")[1].strip().strip('"')
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                supabase_key = line.split("=")[1].strip().strip('"')
                
    if not supabase_url or not supabase_key:
        print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local")
        sys.exit(1)
        
    return supabase_url, supabase_key

def main():
    supabase_url, supabase_key = load_env()
    local_logs_url = "http://localhost:3000/api/logs"
    
    sb_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # Dummy Session ID (Using client-compatible format: session_xxxxxx)
    test_session_id = "session_test_str_id_12345"
    test_student_code = "TEST_STUDENT_001"
    
    print("==================================================")
    print("Scenario A: 존재하지 않는 student_code로 요청 (404 예상)")
    print("==================================================")
    payload_a = {
        "student_code": "NON_EXISTENT_STUDENT",
        "session_id": test_session_id,
        "events": [
            {
                "sessionId": test_session_id,
                "timestamp": "2026-08-12T06:00:00.000Z",
                "type": "block_change",
                "payload": {"action": "insertBlock", "blockType": "move_direction"}
            }
        ]
    }
    res_a = requests.post(local_logs_url, json=payload_a)
    print("HTTP Status Code:", res_a.status_code)
    print("Response Body:")
    print(json.dumps(res_a.json(), indent=2, ensure_ascii=False))
    
    print("\n[DB Setup] 더미 학급 및 학생(consent_status: true) 생성")
    # 1. Insert Classroom
    class_payload = {
        "name": "테스트용 임시 학급",
        "teacher_name": "홍길동교사"
    }
    class_res = requests.post(f"{supabase_url}/rest/v1/classrooms", json=class_payload, headers=sb_headers)
    if class_res.status_code != 201:
        print("Failed to create classroom:", class_res.text)
        sys.exit(1)
    
    classroom_id = class_res.json()[0]["id"]
    print(f"Created Classroom ID: {classroom_id}")
    
    # 2. Insert Student
    student_payload = {
        "classroom_id": classroom_id,
        "student_code": test_student_code,
        "consent_status": True
    }
    student_res = requests.post(f"{supabase_url}/rest/v1/students", json=student_payload, headers=sb_headers)
    if student_res.status_code != 201:
        print("Failed to create student:", student_res.text)
        # Cleanup classroom
        requests.delete(f"{supabase_url}/rest/v1/classrooms?id=eq.{classroom_id}", headers=sb_headers)
        sys.exit(1)
        
    student_id = student_res.json()[0]["id"]
    print(f"Created Student ID: {student_id} (student_code: {test_student_code}, consent_status: True)")

    print("\n==================================================")
    print("Scenario B: 등록된 학생(consent_status: True)으로 요청 (200 예상)")
    print("==================================================")
    payload_b = {
        "student_code": test_student_code,
        "session_id": test_session_id,
        "events": [
            {
                "sessionId": test_session_id,
                "timestamp": "2026-08-12T06:01:00.000Z",
                "type": "block_change",
                "payload": {"action": "insertBlock", "blockType": "move_direction"}
            },
            {
                "sessionId": test_session_id,
                "timestamp": "2026-08-12T06:01:05.000Z",
                "type": "run_start",
                "payload": {}
            }
        ]
    }
    res_b = requests.post(local_logs_url, json=payload_b)
    print("HTTP Status Code:", res_b.status_code)
    print("Response Body:")
    print(json.dumps(res_b.json(), indent=2, ensure_ascii=False))
    
    # Verify DB insertion of events
    verify_res = requests.get(f"{supabase_url}/rest/v1/events?session_id=eq.{test_session_id}", headers=sb_headers)
    print("\n[DB Verification] events 테이블 조회 결과:")
    try:
        data = verify_res.json()
        if isinstance(data, list):
            print(f"Total events found in DB: {len(data)}")
            for idx, e in enumerate(data):
                if isinstance(e, dict):
                    print(f"  Event #{idx+1}: type={e.get('event_type')}, trigger_strategy={e.get('trigger_strategy')}")
        else:
            print("Raw Data:", data)
    except Exception as e:
        print("Error parsing verify response:", e)
        print("Raw response text:", verify_res.text)

    print("\n==================================================")
    print("Scenario C: 학생의 consent_status를 false로 변경 후 다시 요청 (200 + 스킵 예상)")
    print("==================================================")
    # 1. Update consent_status to false
    patch_payload = {
        "consent_status": False
    }
    patch_res = requests.patch(f"{supabase_url}/rest/v1/students?student_code=eq.{test_student_code}", json=patch_payload, headers=sb_headers)
    if patch_res.status_code not in (200, 204):
        print("Failed to patch student consent_status:", patch_res.text)
    else:
        print(f"Updated student_code '{test_student_code}' consent_status to False.")
        
    # 2. Request logs API again
    res_c = requests.post(local_logs_url, json=payload_b)
    print("HTTP Status Code:", res_c.status_code)
    print("Response Body:")
    print(json.dumps(res_c.json(), indent=2, ensure_ascii=False))

    print("\n[DB Cleanup] 테스트 더미 데이터 삭제 (Classroom 삭제로 Student/Event/Session 연쇄 삭제)")
    del_res = requests.delete(f"{supabase_url}/rest/v1/classrooms?id=eq.{classroom_id}", headers=sb_headers)
    print("Cleanup Status Code:", del_res.status_code)
    print("==================================================")

if __name__ == "__main__":
    main()
