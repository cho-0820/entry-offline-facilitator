import requests
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
    
    sb_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }

    tables = ['classrooms', 'students', 'sessions', 'events']
    print("==================================================")
    print("Supabase Tables Record Count Verification")
    print("==================================================")
    
    all_empty = True
    for table in tables:
        url = f"{supabase_url}/rest/v1/{table}"
        response = requests.get(url, headers=sb_headers)
        
        if response.status_code == 200:
            records = response.json()
            count = len(records)
            print(f"Table '{table}': {count} records found.")
            if count > 0:
                all_empty = False
                print(f"  Warning: table '{table}' is NOT empty! Raw records: {records}")
        else:
            print(f"Error querying table '{table}' [HTTP {response.status_code}]: {response.text}")
            all_empty = False
            
    print("==================================================")
    if all_empty:
        print("결과: 모든 테이블이 100% 비어있음 (Clean 상태 확인 완료).")
    else:
        print("결과: 아직 데이터가 남아있는 테이블이 있습니다. 확인 후 정리 필요.")
    print("==================================================")

if __name__ == "__main__":
    main()
