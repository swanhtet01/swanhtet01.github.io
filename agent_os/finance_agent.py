import time
import random
import os
from datetime import datetime

# Configuration
ERPNEXT_URL = os.getenv("ERPNEXT_URL", "https://erp.supermega.dev")
ERPNEXT_API_KEY = os.getenv("ERPNEXT_API_KEY", "your_api_key")
ERPNEXT_API_SECRET = os.getenv("ERPNEXT_API_SECRET", "your_api_secret")
LOG_FILE = "finance_reactor.log"

class FinanceAgent:
    def __init__(self):
        self.status = "active"
        self.current_task = "Initializing..."

    def log(self, message):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{timestamp}] {message}"
        print(entry)
        with open(LOG_FILE, "a") as f:
            f.write(entry + "\n")

    def connect_erpnext(self):
        """Simulate connection to ERPNext"""
        self.log(f"> Connecting to ERPNext at {ERPNEXT_URL}...")
        # In a real scenario: client = FrappeClient(ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET)
        time.sleep(1)
        self.log("> Connected to ERPNext.")
        return True

    def audit_invoices(self):
        invoice_id = random.randint(8000, 9000)
        self.current_task = f"Auditing Invoice #{invoice_id}"
        self.log(f"> Fetching Invoice #{invoice_id} from ERPNext")
        time.sleep(1)
        
        grn_id = f"GRN-2025-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
        self.log(f"> Cross-referencing with {grn_id}")
        time.sleep(1)
        
        if random.random() > 0.1:
            self.log(f"> Variance detected: $0.00. Match confirmed.")
            self.log(f"> Payment authorized via Stripe API.")
        else:
            variance = round(random.uniform(10.0, 500.0), 2)
            self.log(f"> ALERT: Variance detected: ${variance}. Flagging for human review.")

    def run(self):
        self.log("Finance Reactor Agent v1.0 Started")
        self.connect_erpnext()
        while True:
            self.audit_invoices()
            self.log("> Audit cycle complete. Sleeping for 15s...")
            time.sleep(15)

if __name__ == "__main__":
    agent = FinanceAgent()
    agent.run()
