const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs'); // เรียกใช้งาน fs มอดูลสำหรับจัดการไฟล์
const app = express();
const port = 3000;

// ตั้งค่า Middleware และ View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // บังคับให้หาโฟลเดอร์ views ได้ถูกต้องแม่นยำ
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: 'emergency-secret-key',
    resave: false,
    saveUninitialized: true
}));

// ตั้งค่า Multer สำหรับอัปโหลดรูปภาพปกติจากเครื่อง
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// สร้างโฟลเดอร์ uploads อัตโนมัติถ้ายังไม่มีในระบบ
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

// ----------------------------------------------------------------
// [DATA STATE] จำลองฐานข้อมูล In-Memory Database (Array)
// ----------------------------------------------------------------
const users = [
    // 1. บัญชีเดโมของฝั่งนักศึกษา/ผู้แจ้งเหตุ (Student/User)
    { 
        id: 2, 
        username: 'student', 
        password: '123', 
        name: 'นายสมศักดิ์ รักดี', 
        phone: '0999999999', 
        studentId: '65010912345', 
        residence: 'หอพักใน มอ อาคาร B', 
        role: 'user' 
    },
    // 2. บัญชีเดโมของเจ้าหน้าที่ปฏิบัติการ (Staff)
    { 
        id: 1, 
        username: 'staff', 
        password: '123', 
        name: 'เจ้าหน้าที่ สมชาย', 
        phone: '0812345678', 
        role: 'staff' 
    },
    // 3. บัญชีเดโมของผู้ดูแลระบบ (Admin)
    {
        id: 3,
        username: 'admin',
        password: '123',
        name: 'ผู้ดูแลระบบ สูงสุด',
        phone: '020000000',
        role: 'admin'
    }
];

const incidents = [
    {
        id: 1,
        userId: 2,
        userName: 'นายสมศักดิ์ รักดี',
        type: 'อุบัติเหตุ',
        details: 'รถจักรยานยนต์ล้มหน้าอาคารเรียน 3 มีผู้บาดเจ็บเล็กน้อย',
        location: 'หน้าอาคาร 3',
        imageUrl: '',
        status: 'รอการตอบสนอง',
        staffNotes: '',
        createdAt: new Date().toLocaleString('th-TH')
    }
];

// ----------------------------------------------------------------
// [ROUTES] ส่วนควบคุมการทำงานของระบบ
// ----------------------------------------------------------------

// หน้าแรก - ตรวจสอบสิทธิ์และแยกฝั่งผู้ใช้ตามบทบาท (Role)
app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role === 'staff') return res.redirect('/staff/dashboard');
    if (req.session.user.role === 'admin') return res.redirect('/staff/dashboard'); // ชี้ไปแดชบอร์ดหลังบ้านหากเป็นแอดมิน
    res.redirect('/user/dashboard');
});

// หน้าเข้าสู่ระบบ
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    const { username, password, role } = req.body;
    
    // ค้นหาผู้ใช้งานที่ตรงทั้ง username, password และ role
    const user = users.find(u => u.username === username && u.password === password && u.role === role);
    
    if (user) {
        req.session.user = user;
        return res.redirect('/');
    }
    res.render('login', { error: 'ชื่อผู้ใช้, รหัสผ่าน หรือระดับผู้ใช้งานไม่ถูกต้อง' });
});

// หน้าลงทะเบียนผู้ใช้งานใหม่ (นักศึกษา)
app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
    const { username, password, name, phone, studentId, residence } = req.body;
    const newUser = { id: users.length + 1, username, password, name, phone, studentId, residence, role: 'user' };
    users.push(newUser);
    req.session.user = newUser; // ให้เข้าสู่ระบบอัตโนมัติทันทีหลังลงทะเบียนเสร็จ
    res.redirect('/');
});

// ออกจากระบบ
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ----------------------------------------------------------------
// [USER ROLE] ฟังก์ชันฝั่งผู้แจ้งเหตุ (นักศึกษา)
// ----------------------------------------------------------------
app.get('/user/dashboard', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') return res.redirect('/login');
    const myIncidents = incidents.filter(i => i.userId === req.session.user.id);
    res.render('user_dashboard', { user: req.session.user, incidents: myIncidents });
});

// เส้นทางรับแจ้งเหตุฉุกเฉิน (รองรับทั้งไฟล์รูปภาพปกติและการถ่ายภาพสดแบบ Base64)
app.post('/incident/report', upload.single('image'), (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { type, details, location, capturedImage } = req.body;
    
    let imageUrl = '';
    
    // เคสที่ 1: ตรวจสอบว่าผู้ใช้งานใช้วิธีถ่ายรูปสดจากกล้องเข้ามา (ข้อมูลมาเป็น Base64 Data URL)
    if (capturedImage && capturedImage.startsWith('data:image')) {
        const base64Data = capturedImage.replace(/^data:image\/(jpeg|png);base64,/, "");
        const filename = `cam-${Date.now()}.jpg`;
        // เขียนไฟล์รูปภาพลงไปยังโฟลเดอร์ uploads
        fs.writeFileSync(`./uploads/${filename}`, base64Data, 'base64');
        imageUrl = `/uploads/${filename}`;
    } 
    // เคสที่ 2: เป็นการเลือกอัปโหลดไฟล์รูปภาพปกติจากเครื่องผ่าน Input File
    else if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
    }
    
    const newIncident = {
        id: incidents.length + 1,
        userId: req.session.user.id,
        userName: req.session.user.name,
        type,
        details,
        location,
        imageUrl,
        status: 'รอการตอบสนอง',
        staffNotes: '',
        createdAt: new Date().toLocaleString('th-TH')
    };
    incidents.push(newIncident);
    res.redirect('/user/dashboard');
});

// ----------------------------------------------------------------
// [STAFF ROLE] ฟังก์ชันฝั่งเจ้าหน้าที่ และการคำนวณรายงานสถิติ
// ----------------------------------------------------------------
app.get('/staff/dashboard', (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'staff' && req.session.user.role !== 'admin')) {
        return res.redirect('/login');
    }
    
    // คำนวณสถิติรายงานสำหรับแสดงผลบนแดชบอร์ดหลังบ้าน
    const stats = { total: incidents.length, accident: 0, fire: 0, fight: 0, illness: 0, others: 0 };
    incidents.forEach(i => {
        if (i.type === 'อุบัติเหตุ') stats.accident++;
        else if (i.type === 'ไฟไหม้') stats.fire++;
        else if (i.type === 'ทะเลาะวิวาท / เหตุรุนแรง') stats.fight++;
        else if (i.type === 'เจ็บป่วยฉุกเฉิน') stats.illness++;
        else stats.others++;
    });

    res.render('staff_dashboard', { user: req.session.user, incidents, stats });
});

// เจ้าหน้าที่อัปเดตสถานะและบันทึกข้อมูลการช่วยเหลือกู้ภัย
app.post('/staff/incident/update/:id', (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'staff' && req.session.user.role !== 'admin')) {
        return res.redirect('/login');
    }
    const incidentId = parseInt(req.params.id);
    const { status, staffNotes } = req.body;
    
    const incident = incidents.find(i => i.id === incidentId);
    if (incident) {
        incident.status = status;
        incident.staffNotes = staffNotes;
    }
    res.redirect('/staff/dashboard');
});

// ----------------------------------------------------------------
// [START SERVER] สั่งเปิดพอร์ตเพื่อรันระบบเปิดหน้าเว็บจริง
// ----------------------------------------------------------------
app.listen(port, () => {
    console.log(`==================================================`);
    console.log(`🚀 Emergency app is running on port: ${port}`);
    console.log(`🔗 Access the site at: http://localhost:${port}`);
    console.log(`==================================================`);
});