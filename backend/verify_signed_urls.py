import asyncio
import json
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def verify_runtime_signed_urls():
    async with httpx.AsyncClient() as client:
        # 1. Query mobile sermons
        res = await client.get(f"{BASE_URL}/mobile/sermons")
        print("Mobile Sermons Status:", res.status_code)
        data = res.json()
        print("Sermons payload keys:", data.keys())
        if data.get("items"):
            item = data["items"][0]
            print("\nSample Mobile Sermon Payload:")
            print(json.dumps(item, indent=2))
        else:
            print("No published sermons found in DB.")

        # 2. Query mobile home
        res_home = await client.get(f"{BASE_URL}/mobile/home")
        print("\nMobile Home Status:", res_home.status_code)

if __name__ == "__main__":
    asyncio.run(verify_runtime_signed_urls())
