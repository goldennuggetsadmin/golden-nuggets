import os
import uvicorn
from server import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Golden Nuggets API on 0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
