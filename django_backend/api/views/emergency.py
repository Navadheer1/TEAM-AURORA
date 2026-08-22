import json
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from api.models import Complaint, User
from api.middleware.auth import jwt_optional_auth
from api.utils.helpers import generate_complaint_id
from api.services.routing import route_complaint

# Camera state storage in memory
AUTHORIZED_CAMERAS = [
    {
        'id': 'CAM-001',
        'name': 'CCTV 01 — Brodipet Main Arterial Road',
        'location': 'Brodipet Junction, Guntur',
        'district': 'guntur',
        'state': 'andhra pradesh',
        'lat': 16.3067,
        'lng': 80.4365,
        'status': 'online',
        'aiEnabled': True,
        'resolution': '1080p @ 30fps',
        'type': 'ptz_traffic',
        'lastActive': datetime.now().isoformat()
    },
    {
        'id': 'CAM-002',
        'name': 'CCTV 02 — Central Inter-State Bus Station',
        'location': 'RTC Bus Station Complex, Guntur',
        'district': 'guntur',
        'state': 'andhra pradesh',
        'lat': 16.3120,
        'lng': 80.4420,
        'status': 'online',
        'aiEnabled': True,
        'resolution': '1080p @ 30fps',
        'type': 'fixed_dome',
        'lastActive': datetime.now().isoformat()
    },
    {
        'id': 'CAM-003',
        'name': 'CCTV 03 — Krishna Canal Low-Lying Flood Zone',
        'location': 'Krishna Canal Spillway Zone, Guntur Outskirts',
        'district': 'guntur',
        'state': 'andhra pradesh',
        'lat': 16.2950,
        'lng': 80.4280,
        'status': 'online',
        'aiEnabled': True,
        'resolution': '4K @ 24fps (Thermal)',
        'type': 'thermal_flood_gauge',
        'lastActive': datetime.now().isoformat()
    },
    {
        'id': 'CAM-004',
        'name': 'CCTV 04 — Arundelpet Commercial Market & Square',
        'location': 'Arundelpet 5th Line Market Area',
        'district': 'guntur',
        'state': 'andhra pradesh',
        'lat': 16.3150,
        'lng': 80.4490,
        'status': 'online',
        'aiEnabled': True,
        'resolution': '1080p @ 30fps',
        'type': 'panoramic_crowd',
        'lastActive': datetime.now().isoformat()
    },
    {
        'id': 'CAM-005',
        'name': 'CCTV 05 — Industrial Chemical Zone & Storage Corridor',
        'location': 'Autonagar Industrial Corridor, Guntur',
        'district': 'guntur',
        'state': 'andhra pradesh',
        'lat': 16.3280,
        'lng': 80.4610,
        'status': 'online',
        'aiEnabled': True,
        'resolution': '1080p @ 30fps',
        'type': 'flame_gas_sensor',
        'lastActive': datetime.now().isoformat()
    }
]

CAMERA_MAP = {c['id']: c for c in AUTHORIZED_CAMERAS}

@csrf_exempt
@require_http_methods(["GET"])
def get_authorized_cameras_view(request):
    return JsonResponse({'success': True, 'data': list(CAMERA_MAP.values())})

@csrf_exempt
@require_http_methods(["PUT", "POST"])
def toggle_camera_ai_view(request, id):
    camera = CAMERA_MAP.get(id)
    if not camera:
        return JsonResponse({'success': False, 'message': 'Camera not found.'}, status=404)
    camera['aiEnabled'] = not camera['aiEnabled']
    camera['lastActive'] = datetime.now().isoformat()
    return JsonResponse({
        'success': True,
        'message': f"Camera {camera['id']} AI detection {'enabled' if camera['aiEnabled'] else 'disabled'}.",
        'data': camera
    })

@csrf_exempt
@jwt_optional_auth
@require_http_methods(["POST"])
def detect_emergency_frame_view(request):
    is_multipart = request.content_type.startswith('multipart/form-data')
    if is_multipart:
        data_source = request.POST
        uploaded_file = request.FILES.get('image')
    else:
        try:
            data_source = json.loads(request.body)
        except ValueError:
            data_source = {}
        uploaded_file = None

    scenario = data_source.get('scenario')
    mode = data_source.get('mode', 'cctv')

    # Default emergency detection response
    detection_result = {
        'eventType': 'ACTIVE DISASTER / HAZARD DETECTED',
        'category': 'emergency_flood',
        'severity': 'Critical',
        'confidence': 94,
        'verificationStatus': 'Verified High-Confidence Emergency',
        'canAutoCreate': True,
        'evidence': [
            'Visual frame pattern recognition matches flash flood anomaly',
            'Water volume accumulation rate exceeds safe drainage capacity',
            'Multiple vehicle stoppages and submerged infrastructure detected'
        ],
        'signals': [
            {'source': f"Camera Stream ({mode.upper()})", 'weight': 40, 'verified': True},
            {'source': 'Visual Frame Pattern Recognition', 'weight': 25, 'verified': True},
            {'source': 'Civic Environmental Base Matrix', 'weight': 15, 'verified': True},
            {'source': 'Authority Incident Registry Check', 'weight': 15, 'verified': True}
        ],
        'mode': mode,
        'isDemo': True if scenario else False,
        'timestamp': datetime.now().isoformat(),
        'cameraId': data_source.get('cameraId', 'CAM-003'),
        'location': {
            'address': 'Krishna Canal Spillway Zone, Guntur',
            'lat': 16.2950,
            'lng': 80.4280,
            'district': 'guntur',
            'state': 'andhra pradesh'
        }
    }

    if uploaded_file:
        try:
            from api.services.ai import detect_issue_from_image
            file_bytes = uploaded_file.read()
            ai_res = detect_issue_from_image(file_bytes, uploaded_file.content_type, uploaded_file.name)
            if ai_res.get('success'):
                detection_result['eventType'] = ai_res.get('detectedCategory', 'CIVIC EMERGENCY').upper()
                detection_result['category'] = ai_res.get('mappedCategory', 'emergency_fire')
                detection_result['severity'] = ai_res.get('severity', 'High')
                detection_result['confidence'] = int(ai_res.get('confidence', 0.9) * 100)
                detection_result['evidence'] = [ai_res.get('reason', 'Anomalous hazard pattern detected in frame')]
        except Exception as err:
            print("AI detection frame error:", str(err))

    return JsonResponse({'success': True, 'data': detection_result})

@csrf_exempt
@jwt_optional_auth
@require_http_methods(["GET", "POST"])
def emergency_incidents_view(request):
    if request.method == "GET":
        incidents_qs = Complaint.objects.filter(is_emergency=True).order_by('-created_at')
        data = []
        for inc in incidents_qs:
            data.append({
                'id': inc.id,
                'complaintId': inc.complaint_id,
                'title': f"[EMERGENCY] {inc.category.replace('_', ' ').title()}",
                'description': inc.description,
                'category': inc.category,
                'subcategory': inc.subcategory,
                'severity': inc.location.get('severity', 'Critical') if isinstance(inc.location, dict) else 'Critical',
                'status': inc.status,
                'lifecycleState': 'CONFIRMED' if inc.status == 'pending' else inc.status.upper(),
                'source': 'citizen_sos' if inc.is_anonymous else 'ai_camera',
                'confidence': 94,
                'evidenceList': [inc.description],
                'supportingSignalsCount': 1,
                'location': inc.location,
                'assignedAuthorityName': inc.routing.get('authorityName') if isinstance(inc.routing, dict) else 'Disaster Unit',
                'createdAt': inc.created_at.isoformat() if inc.created_at else datetime.now().isoformat(),
                'updatedAt': inc.updated_at.isoformat() if inc.updated_at else datetime.now().isoformat()
            })
        return JsonResponse({'success': True, 'data': data})

    if request.method == "POST":
        is_multipart = request.content_type.startswith('multipart/form-data')
        if is_multipart:
            data_source = request.POST
        else:
            try:
                data_source = json.loads(request.body)
            except ValueError:
                data_source = {}

        category = data_source.get('subcategory') or data_source.get('category') or 'emergency_flood'
        description = data_source.get('description') or data_source.get('title') or 'Emergency report received'
        severity = data_source.get('severity') or 'Critical'

        loc_raw = data_source.get('location')
        if isinstance(loc_raw, str):
            try:
                loc_raw = json.loads(loc_raw)
            except ValueError:
                loc_raw = {}
        if not loc_raw or not isinstance(loc_raw, dict):
            loc_raw = {
                'address': 'Guntur Emergency Sector',
                'district': 'guntur',
                'state': 'andhra pradesh',
                'lat': 16.3067,
                'lng': 80.4365
            }

        loc_raw['severity'] = severity

        routing = route_complaint('civic_issue', category, loc_raw)
        complaint_id = generate_complaint_id('emergency', loc_raw.get('state'))

        complaint = Complaint(
            complaint_id=complaint_id,
            category='civic_issue',
            subcategory=category,
            description=description,
            location=loc_raw,
            is_anonymous=False,
            user_id=request.user.id if request.user else None,
            user_name=request.user.name if request.user else 'Emergency System',
            status='pending',
            is_emergency=True,
            routing=routing,
            status_history=[{
                'status': 'pending',
                'remarks': 'Emergency SOS broadcast received and routed.',
                'timestamp': datetime.now().isoformat(),
                'updatedBy': 'system'
            }]
        )
        complaint.save()

        return JsonResponse({
            'success': True,
            'message': f"Emergency Incident #{complaint_id} dispatched.",
            'data': {
                'id': complaint.id,
                'complaintId': complaint.complaint_id,
                'status': 'pending',
                'category': category,
                'location': loc_raw
            }
        }, status=201)

@csrf_exempt
@jwt_optional_auth
@require_http_methods(["PUT"])
def update_emergency_status_view(request, id):
    try:
        complaint = Complaint.objects.get(id=id)
        try:
            body = json.loads(request.body)
        except ValueError:
            body = {}
        status = body.get('status', 'investigating')
        complaint.status = status
        complaint.save()
        return JsonResponse({'success': True, 'message': f"Incident status updated to {status}."})
    except Complaint.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Incident not found.'}, status=404)

@csrf_exempt
@require_http_methods(["GET"])
def get_emergency_telemetry_view(request):
    telemetry = {
        'alertLevel': 'Elevated Alert',
        'weatherAlert': 'IMD Coastal Warning: Heavy localized precipitation forecast',
        'floodRiverGauge': 'Krishna River Basin: 3.4m / 4.2m Warning Mark (Rising)',
        'seismicStatus': 'Seismic Intensity: Normal (0.8 Richter)',
        'activeCCTVCount': len(AUTHORIZED_CAMERAS),
        'activeCCTVOnline': len([c for c in AUTHORIZED_CAMERAS if c['status'] == 'online']),
        'lastSyncTimestamp': datetime.now().isoformat()
    }
    return JsonResponse({'success': True, 'data': telemetry})
