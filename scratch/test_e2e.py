import httpx
import json

client = httpx.Client(base_url="http://localhost:8000", timeout=60.0)

# 1. Health check
health = client.get("/api/health").json()
print("1. Health check:", health)
assert health["status"] == "ok"

# 2. Upload image
with open("backend/uploads/190bb3f7-b89d-43d0-ae00-82577f9184fd_Bill12.jpg", "rb") as f:
    files = {"files": ("bill.jpg", f, "image/jpeg")}
    res_upload = client.post("/api/bills/upload", files=files)

assert res_upload.status_code == 200, res_upload.text
bill_data = res_upload.json()
bill_id = bill_data["bill_id"]
print(f"2. Upload success! Bill ID: {bill_id}")

# 3. Extract with Gemini inbuilt OCR
res_extract = client.post(f"/api/bills/{bill_id}/extract")
assert res_extract.status_code == 200, res_extract.text
extracted = res_extract.json()
print(f"3. Gemini Inbuilt OCR Extraction success!")
print(f"   Merchant: {extracted.get('merchant_name')}")
print(f"   Calculated Subtotal: INR {extracted.get('subtotal_calculated')}")
print(f"   Calculated Total: INR {extracted.get('total_calculated')}")
print(f"   Line items ({len(extracted.get('line_items', []))} items):")
for it in extracted.get("line_items", []):
    print(f"     - {it['name']}: qty={it['quantity']}, unit={it['unit_price']}, total={it['line_total']}")
print(f"   Taxes ({len(extracted.get('taxes', []))} taxes):")
for t in extracted.get("taxes", []):
    print(f"     - {t['name']}: rate={t.get('rate')}, amount={t['amount']}")

# 4. Confirm bill
res_confirm = client.post(f"/api/bills/{bill_id}/confirm")
assert res_confirm.status_code == 200, res_confirm.text
print(f"4. Bill confirmed successfully!")

# 5. Add people
people_payload = {
    "people": [
        {"name": "Rohit"},
        {"name": "Rahul"},
        {"name": "Pooja"}
    ]
}
res_people = client.post(f"/api/bills/{bill_id}/people", json=people_payload)
assert res_people.status_code == 200, res_people.text
people_data = res_people.json()
people_ids = [p["id"] for p in people_data["people"]]
print(f"5. Added 3 participants: {[p['name'] for p in people_data['people']]}")

# 6. Test Natural Language Assignment parse using Gemini
res_nl = client.post(
    f"/api/bills/{bill_id}/assignments/parse",
    json={"instruction": "Rohit had Medu Wada, Rahul had Sada Dosa, Pooja had MSL Dosa, everyone shared the Cheese Toast"}
)
assert res_nl.status_code == 200, res_nl.text
nl_proposal = res_nl.json()
print(f"6. Gemini NL Assignment parse successful ({len(nl_proposal.get('proposal', []))} proposed allocations)!")

# 7. Assign items deterministically
items = extracted["line_items"]
assignments = [
    {
        "line_item_id": items[0]["id"],
        "allocations": [{"person_id": people_ids[0], "quantity": str(items[0]["quantity"])}]
    },
    {
        "line_item_id": items[1]["id"],
        "allocations": [{"person_id": people_ids[1], "quantity": str(items[1]["quantity"])}]
    },
    {
        "line_item_id": items[2]["id"],
        "allocations": [{"person_id": people_ids[2], "quantity": str(items[2]["quantity"])}]
    },
    {
        "line_item_id": items[3]["id"],
        "allocations": [
            {"person_id": people_ids[0], "quantity": "1"},
            {"person_id": people_ids[1], "quantity": "1"}
        ]
    },
    {
        "line_item_id": items[4]["id"],
        "allocations": [
            {"person_id": people_ids[0], "quantity": "1"},
            {"person_id": people_ids[2], "quantity": "1"}
        ]
    },
]
res_assign = client.post(f"/api/bills/{bill_id}/assignments", json={"assignments": assignments})
assert res_assign.status_code == 200, res_assign.text
print("7. Assigned all items successfully!")

# 8. Calculate exact split
res_calc = client.post(f"/api/bills/{bill_id}/calculate")
assert res_calc.status_code == 200, res_calc.text
calc_result = res_calc.json()
print("\n8. Split Calculation Result:")
print(f"   Final Bill Total: ₹{calc_result['final_bill_total']}")
print(f"   People Total: ₹{calc_result['people_total']}")
print(f"   Reconciled (Invariant Check): {calc_result['reconciled']}")
for p in calc_result["people"]:
    print(f"     - {p['name']}: Food Subtotal = ₹{p['food_subtotal']}, Taxes = {p['tax_breakdown']}, Total Share = ₹{p['total']}")

assert calc_result['reconciled'] is True
assert calc_result['people_total'] == calc_result['final_bill_total']
print("\n✨ ALL TESTS AND INVARIANTS PASSED PERFECTLY WITH GEMINI INBUILT OCR! ✨")
