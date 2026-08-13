import requests
import json
import sys

# Reconfigure stdout to force UTF-8 output on Windows terminal
sys.stdout.reconfigure(encoding='utf-8')

def main():
    url = "http://localhost:3000/api/chat"
    payload = {
        "prompt": "오브젝트를 오른쪽으로 10만큼 움직이고 안녕이라고 말하게 해줘"
    }
    headers = {
        "Content-Type": "application/json"
    }
    
    response = requests.post(url, json=payload, headers=headers)
    print("Status Code:", response.status_code)
    
    try:
        res_json = response.json()
        print("\n--- Response Text ---")
        print(res_json.get("text"))
        
        print("\n--- Response Code JSON ---")
        print(json.dumps(res_json.get("code_json"), indent=2, ensure_ascii=False))
        
        print("\n--- Is Valid Types ---")
        print(res_json.get("isValidTypes"))
    except Exception as e:
        print("Error parsing response:", e)
        print("Raw response:", response.text)

if __name__ == "__main__":
    main()
