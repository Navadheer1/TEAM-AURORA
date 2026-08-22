import os
import json
import django
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'grievance_portal.settings')
django.setup()

from api.models import Complaint, User

def seed_from_mockdb():
    print("--- Seeding complaints from .mockdb.json ---")
    mockdb_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend', '.mockdb.json')
    
    if not os.path.exists(mockdb_path):
        print(f"File not found: {mockdb_path}")
        return

    with open(mockdb_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    complaints_data = data.get('complaints', {})
    count = 0

    for item_id, item in complaints_data.items():
        cid = item.get('complaintId') or item_id
        if Complaint.objects.filter(complaint_id=cid).exists():
            continue

        loc = item.get('location') or {}
        # Ensure lat & lng exist
        if 'lat' not in loc or loc['lat'] is None:
            loc['lat'] = 16.3067
        if 'lng' not in loc or loc['lng'] is None:
            loc['lng'] = 80.4365

        created_str = item.get('createdAt')
        try:
            created_at = datetime.fromisoformat(created_str.replace('Z', '+00:00')) if created_str else datetime.now()
        except ValueError:
            created_at = datetime.now()

        due_str = item.get('escalationDue')
        try:
            due_at = datetime.fromisoformat(due_str.replace('Z', '+00:00')) if due_str else datetime.now()
        except ValueError:
            due_at = datetime.now()

        closed_str = item.get('closedAt')
        closed_at = None
        if closed_str:
            try:
                closed_at = datetime.fromisoformat(closed_str.replace('Z', '+00:00'))
            except ValueError:
                pass

        complaint = Complaint(
            id=item.get('id') or item_id,
            complaint_id=cid,
            category=item.get('category', 'civic_issue'),
            subcategory=item.get('subcategory', 'road_damage'),
            description=item.get('description', 'Reported civic issue'),
            location=loc,
            is_anonymous=item.get('isAnonymous', False),
            user_id=item.get('userId'),
            user_name=item.get('userName', 'Citizen User'),
            user_email=item.get('userEmail'),
            user_phone=item.get('userPhone'),
            attachments=item.get('attachments', []),
            status=item.get('status', 'pending'),
            routing=item.get('routing') or {
                'authorityId': 'authorities-26859f871c3a',
                'authorityType': 'municipal',
                'authorityName': 'Guntur Municipal Corp',
                'assignedAt': datetime.now().isoformat()
            },
            status_history=item.get('statusHistory', []),
            remarks=item.get('remarks', []),
            proof_uploads=item.get('proofUploads', []),
            preferred_language=item.get('preferredLanguage', 'en'),
            escalation_level=item.get('escalationLevel', 0),
            escalation_due=due_at,
            is_escalated=item.get('isEscalated', False),
            is_emergency=item.get('isEmergency', False),
            closed_at=closed_at
        )
        complaint.save()
        count += 1

    print(f"Successfully seeded {count} complaints into SQLite!")

if __name__ == '__main__':
    seed_from_mockdb()
