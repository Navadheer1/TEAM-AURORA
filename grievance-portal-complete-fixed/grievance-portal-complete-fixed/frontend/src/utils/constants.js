// ======= Complaint Categories =======
export const CATEGORIES = {
  crime: {
    label: 'Crime',
    icon: '🚨',
    color: 'red',
    subcategories: [
      { value: 'theft', label: 'Theft / Robbery' },
      { value: 'assault', label: 'Assault / Physical Violence' },
      { value: 'murder', label: 'Murder / Attempt to Murder' },
      { value: 'kidnapping', label: 'Kidnapping / Missing Person' },
      { value: 'cybercrime', label: 'Cybercrime / Online Fraud' },
      { value: 'fraud', label: 'Financial Fraud / Cheating' },
      { value: 'harassment', label: 'Harassment / Stalking' },
      { value: 'domestic_violence', label: 'Domestic Violence' },
      { value: 'drug_trafficking', label: 'Drug Trafficking' },
      { value: 'other_crime', label: 'Other Crime' },
    ],
  },
  corruption: {
    label: 'Corruption',
    icon: '⚖️',
    color: 'purple',
    subcategories: [
      { value: 'bribery', label: 'Bribery / Demand for Bribe' },
      { value: 'embezzlement', label: 'Embezzlement of Public Funds' },
      { value: 'government_misconduct', label: 'Government Official Misconduct' },
      { value: 'land_grabbing', label: 'Land Grabbing / Illegal Encroachment' },
      { value: 'ration_corruption', label: 'Ration / PDS Corruption' },
      { value: 'tender_fraud', label: 'Tender / Contract Fraud' },
      { value: 'police_corruption', label: 'Police Corruption' },
      { value: 'other_corruption', label: 'Other Corruption' },
    ],
  },
  civic_issue: {
    label: 'Civic Issue',
    icon: '🏙️',
    color: 'teal',
    subcategories: [
      { value: 'road_damage', label: 'Road Damage / Pothole' },
      { value: 'water_supply', label: 'Water Supply Issue' },
      { value: 'sewage', label: 'Sewage / Drainage Problem' },
      { value: 'garbage', label: 'Garbage / Waste Management' },
      { value: 'electricity', label: 'Electricity Issue' },
      { value: 'street_light', label: 'Street Light Failure' },
      { value: 'noise_pollution', label: 'Noise Pollution' },
      { value: 'illegal_construction', label: 'Illegal Construction' },
      { value: 'park_maintenance', label: 'Park / Public Space Issue' },
      { value: 'other_civic', label: 'Other Civic Issue' },
    ],
  },
  fire: {
    label: 'Fire Safety / Emergency',
    icon: '🔥',
    color: 'orange',
    subcategories: [
      { value: 'fire_outbreak', label: 'Active Fire Outbreak' },
      { value: 'safety_hazard', label: 'Fire Safety Hazard / Code Violation' },
      { value: 'gas_leak', label: 'Hazardous Gas Leak' },
      { value: 'other_fire', label: 'Other Fire Incident' },
    ],
  },
  hospital: {
    label: 'Healthcare / Hospital',
    icon: '🏥',
    color: 'rose',
    subcategories: [
      { value: 'ambulance_delay', label: 'Ambulance Delay / Service Issue' },
      { value: 'medical_negligence', label: 'Medical Negligence / Grievance' },
      { value: 'hospital_infra', label: 'Hospital Infrastructure Failure' },
      { value: 'other_hospital', label: 'Other Healthcare Issue' },
    ],
  },
};

// ======= Centralized AI Vision Categories =======
export const AI_VISION_CATEGORIES = [
  { value: 'Road / Pothole', label: 'Road / Pothole', icon: '🛣️', category: 'civic_issue', subcategory: 'road_damage' },
  { value: 'Garbage / Waste Management', label: 'Garbage / Waste Management', icon: '🗑️', category: 'civic_issue', subcategory: 'garbage' },
  { value: 'Streetlight', label: 'Streetlight', icon: '💡', category: 'civic_issue', subcategory: 'street_light' },
  { value: 'Drainage / Sewage', label: 'Drainage / Sewage', icon: '🚰', category: 'civic_issue', subcategory: 'sewage' },
  { value: 'Water Supply', label: 'Water Supply', icon: '💧', category: 'civic_issue', subcategory: 'water_supply' },
  { value: 'Traffic Signal', label: 'Traffic Signal', icon: '🚦', category: 'civic_issue', subcategory: 'street_light' },
  { value: 'Broken Footpath', label: 'Broken Footpath', icon: '🚶', category: 'civic_issue', subcategory: 'road_damage' },
  { value: 'Public Infrastructure', label: 'Public Infrastructure', icon: '🏛️', category: 'civic_issue', subcategory: 'park_maintenance' },
  { value: 'Illegal Dumping', label: 'Illegal Dumping', icon: '⚠️', category: 'civic_issue', subcategory: 'garbage' },
  { value: 'Flooding / Waterlogging', label: 'Flooding / Waterlogging', icon: '🌊', category: 'civic_issue', subcategory: 'sewage' },
  { value: 'Tree / Fallen Tree', label: 'Tree / Fallen Tree', icon: '🌳', category: 'civic_issue', subcategory: 'park_maintenance' },
  { value: 'Public Safety', label: 'Public Safety', icon: '🛡️', category: 'crime', subcategory: 'other_crime' },
  { value: 'Corruption / Bribery', label: 'Corruption / Bribery', icon: '⚖️', category: 'corruption', subcategory: 'bribery' },
  { value: 'Fire Safety Hazard', label: 'Fire Safety Hazard', icon: '🔥', category: 'fire', subcategory: 'safety_hazard' },
  { value: 'Other', label: 'Other Civic Issue', icon: '📌', category: 'civic_issue', subcategory: 'other_civic' },
];

// ======= Status Labels =======
export const STATUS_LABELS = {
  pending: { label: 'Pending', color: 'amber', description: 'Complaint received, awaiting review' },
  under_review: { label: 'Under Review', color: 'blue', description: 'Being reviewed by authority' },
  investigating: { label: 'Investigating', color: 'purple', description: 'Active investigation underway' },
  action_taken: { label: 'Action Taken', color: 'orange', description: 'Action has been taken' },
  closed: { label: 'Closed', color: 'green', description: 'Complaint resolved and closed' },
  rejected: { label: 'Rejected', color: 'red', description: 'Complaint rejected (invalid/duplicate)' },
};

// ======= Indian States =======
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
  'Jammu & Kashmir', 'Ladakh', 'Puducherry',
];

// ======= Districts Map =======
export const DISTRICTS_MAP = {
  'andhra pradesh': [
    'Anantapur', 'Annamayya', 'Alluri Sitharama Raju', 'Anakapalli', 'Bapatla', 
    'Chittoor', 'East Godavari', 'Eluru', 'Guntur', 'Kakinada', 'Konaseema', 
    'Krishna', 'Kurnool', 'Nandyal', 'NTR', 'Palnadu', 'Parvathipuram Manyam', 
    'Prakasam', 'Nellore', 'Sri Sathya Sai', 'Srikakulam', 'Tirupati', 
    'Visakhapatnam', 'Vizianagaram', 'West Godavari', 'YSR Kadapa'
  ],
  telangana: [
    'Adilabad', 'Bhadradri Kothagudem', 'Hyderabad', 'Jagtial', 'Jangaon', 
    'Jayashankar Bhupalpally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 
    'Khammam', 'Komaram Bheem', 'Mahabubabad', 'Mahabubnagar', 'Mancherial', 
    'Medak', 'Medchal Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 
    'Narayanpet', 'Nirmal', 'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 
    'Rangareddy', 'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad', 
    'Wanaparthy', 'Warangal', 'Hanamkonda', 'Yadadri Bhuvanagiri'
  ],
  karnataka: [
    'Bagalkot', 'Ballari', 'Belagavi', 'Bengaluru Rural', 'Bengaluru Urban', 
    'Bidar', 'Chamarajanagar', 'Chikkaballapura', 'Chikkamagaluru', 'Chitradurga', 
    'Dakshina Kannada', 'Davanagere', 'Dharwad', 'Gadag', 'Hassan', 'Haveri', 
    'Kalaburagi', 'Kodagu', 'Kolar', 'Koppal', 'Mandya', 'Mysuru', 'Raichur', 
    'Ramanagara', 'Shivamogga', 'Tumakuru', 'Udupi', 'Uttara Kannada', 
    'Vijayanagara', 'Vijayapura', 'Yadgir'
  ],
  'tamil nadu': [
    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 
    'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 
    'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 
    'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 
    'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 
    'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 
    'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 
    'Vellore', 'Viluppuram', 'Virudhunagar'
  ],
  maharashtra: [
    'Ahmednagar', 'Akola', 'Amravati', 'Aurangabad (Chhatrapati Sambhajinagar)', 
    'Beed', 'Bhandara', 'Buldhana', 'Chandrapur', 'Dhule', 'Gadchiroli', 
    'Gondia', 'Hingoli', 'Jalgaon', 'Jalna', 'Kolhapur', 'Latur', 'Mumbai City', 
    'Mumbai Suburban', 'Nagpur', 'Nanded', 'Nandurbar', 'Nashik', 'Osmanabad (Dharashiv)', 
    'Palghar', 'Parbhani', 'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara', 
    'Sindhudurg', 'Solapur', 'Thane', 'Wardha', 'Washim', 'Yavatmal'
  ],
  'uttar pradesh': [
    'Agra', 'Aligarh', 'Ambedkar Nagar', 'Amethi', 'Amroha', 'Auraiya', 
    'Ayodhya', 'Azamgarh', 'Baghpat', 'Bahraich', 'Ballia', 'Balrampur', 
    'Banda', 'Barabanki', 'Bareilly', 'Basti', 'Bhadohi', 'Bijnor', 
    'Budaun', 'Bulandshahr', 'Chandauli', 'Chitrakoot', 'Deoria', 'Etah', 
    'Etawah', 'Farrukhabad', 'Fatehpur', 'Firozabad', 'Gautam Buddha Nagar (Noida)', 
    'Ghaziabad', 'Ghazipur', 'Gonda', 'Gorakhpur', 'Hamirpur', 'Hapur', 
    'Hardoi', 'Hathras', 'Jalaun', 'Jaunpur', 'Jhansi', 'Kannauj', 
    'Kanpur Dehat', 'Kanpur Nagar', 'Kasganj', 'Kaushambi', 'Kheri', 
    'Kushinagar', 'Lalitpur', 'Lucknow', 'Maharajganj', 'Mahoba', 'Mainpuri', 
    'Mathura', 'Mau', 'Meerut', 'Mirzapur', 'Moradabad', 'Muzaffarnagar', 
    'Pilibhit', 'Pratapgarh', 'Prayagraj (Allahabad)', 'Raebareli', 'Rampur', 
    'Saharanpur', 'Sambhal', 'Sant Kabir Nagar', 'Shahjahanpur', 'Shamli', 
    'Shravasti', 'Siddharthnagar', 'Sitapur', 'Sonbhadra', 'Sultanpur', 
    'Unnao', 'Varanasi'
  ],
  delhi: [
    'Central Delhi', 'East Delhi', 'New Delhi', 'North Delhi', 
    'North East Delhi', 'North West Delhi', 'Shahdara', 'South Delhi', 
    'South East Delhi', 'South West Delhi', 'West Delhi'
  ],
  kerala: [
    'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam', 
    'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta', 
    'Thiruvananthapuram', 'Thrissur', 'Wayanad'
  ],
  gujarat: [
    'Ahmedabad', 'Amreli', 'Anand', 'Aravalli', 'Banaskantha', 'Bharuch', 
    'Bhavnagar', 'Botad', 'Chhota Udaipur', 'Dahod', 'Dang', 'Devbhoomi Dwarka', 
    'Gandhinagar', 'Gir Somnath', 'Jamnagar', 'Junagadh', 'Kheda', 'Kutch', 
    'Mahisagar', 'Mehsana', 'Morbi', 'Narmada', 'Navsari', 'Panchmahal', 
    'Patan', 'Porbandar', 'Rajkot', 'Sabarkantha', 'Surat', 'Surendranagar', 
    'Tapi', 'Vadodara', 'Valsad'
  ],
  rajasthan: [
    'Ajmer', 'Alwar', 'Banswara', 'Baran', 'Barmer', 'Bharatpur', 'Bhilwara', 
    'Bikaner', 'Bundi', 'Chittorgarh', 'Churu', 'Dausa', 'Dholpur', 'Dungarpur', 
    'Hanumangarh', 'Jaipur', 'Jaisalmer', 'Jalore', 'Jhalawar', 'Jhunjhunu', 
    'Jodhpur', 'Karauli', 'Kota', 'Nagaur', 'Pali', 'Pratapgarh', 'Rajsamand', 
    'Sawai Madhopur', 'Sikar', 'Sirohi', 'Sri Ganganagar', 'Tonk', 'Udaipur'
  ],
  'west bengal': [
    'Alipurduar', 'Bankura', 'Birbhum', 'Cooch Behar', 'Dakshin Dinajpur', 
    'Darjeeling', 'Hooghly', 'Howrah', 'Jalpaiguri', 'Jhargram', 'Kalimpong', 
    'Kolkata', 'Malda', 'Murshidabad', 'Nadia', 'North 24 Parganas', 
    'Paschim Bardhaman', 'Paschim Medinipur', 'Purba Bardhaman', 'Purba Medinipur', 
    'Purulia', 'South 24 Parganas', 'Uttar Dinajpur'
  ],
  bihar: [
    'Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur', 
    'Buxar', 'Darbhanga', 'East Champaran', 'Gaya', 'Gopalganj', 'Jamui', 
    'Jehanabad', 'Kaimur', 'Katihar', 'Khagaria', 'Kishanganj', 'Lakhisarai', 
    'Madhepura', 'Madhubani', 'Munger', 'Muzaffarpur', 'Nalanda', 'Nawada', 
    'Patna', 'Purnia', 'Rohtas', 'Saharsa', 'Samastipur', 'Saran', 'Sheikhpura', 
    'Sheohar', 'Sitamarhi', 'Siwan', 'Supaul', 'Vaishali', 'West Champaran'
  ],
  'madhya pradesh': [
    'Agar Malwa', 'Alirajpur', 'Anuppur', 'Ashoknagar', 'Balaghat', 'Barwani', 
    'Betul', 'Bhind', 'Bhopal', 'Burhanpur', 'Chhatarpur', 'Chhindwara', 
    'Damoh', 'Datia', 'Dewas', 'Dhar', 'Dindori', 'Guna', 'Gwalior', 'Harda', 
    'Hoshangabad', 'Indore', 'Jabalpur', 'Jhabua', 'Katni', 'Khandwa', 
    'Khargone', 'Mandla', 'Mandsaur', 'Morena', 'Narsinghpur', 'Neemuch', 
    'Panna', 'Raisen', 'Rajgarh', 'Ratlam', 'Rewa', 'Sagar', 'Satna', 'Sehore', 
    'Seoni', 'Shahdol', 'Shajapur', 'Sheopur', 'Shivpuri', 'Sidhi', 'Singrauli', 
    'Tikamgarh', 'Ujjain', 'Umaria', 'Vidisha'
  ],
  punjab: [
    'Amritsar', 'Barnala', 'Bathinda', 'Faridkot', 'Fatehgarh Sahib', 
    'Fazilka', 'Ferozepur', 'Gurdaspur', 'Hoshiarpur', 'Jalandhar', 
    'Kapurthala', 'Ludhiana', 'Malerkotla', 'Mansa', 'Moga', 'Muktsar', 
    'Pathankot', 'Patiala', 'Rupnagar', 'Sahibzada Ajit Singh Nagar (Mohali)', 
    'Sangrur', 'Shahid Bhagat Singh Nagar', 'Tarn Taran'
  ],
  haryana: [
    'Ambala', 'Bhiwani', 'Charkhi Dadri', 'Faridabad', 'Fatehabad', 'Gurugram', 
    'Hisar', 'Jhajjar', 'Jind', 'Kaithal', 'Karnal', 'Kurukshetra', 'Mahendragarh', 
    'Nuh', 'Palwal', 'Panchkula', 'Panipat', 'Rewari', 'Rohtak', 'Sirsa', 
    'Sonipat', 'Yamunanagar'
  ],
  odisha: [
    'Angul', 'Balangir', 'Balasore', 'Bargarh', 'Bhadrak', 'Boudh', 'Cuttack', 
    'Deogarh', 'Dhenkanal', 'Gajapati', 'Ganjam', 'Jagatsinghpur', 'Jajpur', 
    'Jharsuguda', 'Kalahandi', 'Kandhamal', 'Kendrapara', 'Kendujhar', 'Khordha', 
    'Koraput', 'Malkangiri', 'Mayurbhanj', 'Nabarangpur', 'Nayagarh', 'Nuapada', 
    'Puri', 'Rayagada', 'Sambalpur', 'Subarnapur', 'Sundargarh'
  ],
  assam: [
    'Baksa', 'Barpeta', 'Biswanath', 'Bongaigaon', 'Cachar', 'Charaideo', 
    'Chirang', 'Darrang', 'Dhemaji', 'Dhubri', 'Dibrugarh', 'Goalpara', 
    'Golaghat', 'Hailakandi', 'Hojai', 'Jorhat', 'Kamrup', 'Kamrup Metropolitan (Guwahati)', 
    'Karbi Anglong', 'Karimganj', 'Kokrajhar', 'Lakhimpur', 'Majuli', 'Morigaon', 
    'Nagaon', 'Nalbari', 'Dima Hasao', 'Sivasagar', 'Sonitpur', 'South Salmara-Mankachar', 
    'Tinsukia', 'Udalguri', 'West Karbi Anglong'
  ],
};

// ======= Role Labels =======
export const ROLE_LABELS = {
  citizen: 'Citizen',
  ps_officer: 'Police Station Officer',
  acb_officer: 'ACB Officer',
  municipal_officer: 'Municipal Officer',
  fire_officer: 'Fire Department Officer',
  hospital_officer: 'Hospital Authority Officer',
  super_admin: 'Super Administrator',
};

// ======= Date formatters =======
export const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const timeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// ======= Languages =======
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
];

// ======= Authority Types =======
export const AUTHORITY_TYPE_INFO = {
  ps: { label: 'Police Station', short: 'PS', icon: '🚔', color: 'blue' },
  acb: { label: 'Anti-Corruption Bureau', short: 'ACB', icon: '⚖️', color: 'purple' },
  municipal: { label: 'Municipal Authority', short: 'MUN', icon: '🏛️', color: 'teal' },
  fire: { label: 'Fire Department', short: 'FIRE', icon: '🔥', color: 'orange' },
  hospital: { label: 'Hospital Authority', short: 'HOSP', icon: '🏥', color: 'rose' },
};
