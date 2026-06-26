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
const ALIAS_FILE = 'aliases.json';
const SECURITY_FILE = 'security.json';

// ============ LEER/GUARDAR DATOS ============
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

function leerAliases() {
    try {
        if (!fs.existsSync(ALIAS_FILE)) {
            fs.writeFileSync(ALIAS_FILE, JSON.stringify({}));
            return {};
        }
        return JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
    } catch { return {}; }
}

function guardarAliases(data) {
    fs.writeFileSync(ALIAS_FILE, JSON.stringify(data, null, 2));
}

// ============ SEGURIDAD ============
function leerSeguridad() {
    try {
        if (!fs.existsSync(SECURITY_FILE)) {
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({}));
            return {};
        }
        return JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf8'));
    } catch { return {}; }
}

function guardarSeguridad(data) {
    fs.writeFileSync(SECURITY_FILE, JSON.stringify(data, null, 2));
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
//  🔒 GENERAR CONTRASEÑA ALEATORIA
// ============================================================
function generarContrasena() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let pass = '';
    for (let i = 0; i < 8; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

// ============================================================
//  🔐 ENDPOINT: CREAR ENLACE CON CONTRASEÑA
// ============================================================
app.post('/api/secure', (req, res) => {
    const { rid, contrasena, expiracion } = req.body;

    if (!rid) {
        return res.status(400).json({ error: 'Falta el RID' });
    }

    const seguridad = leerSeguridad();
    const pass = contrasena || generarContrasena();
    const expira = expiracion || 7;

    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + expira);

    seguridad[rid] = {
        contrasena: pass,
        creado: new Date().toISOString(),
        expiracion: fechaExpiracion.toISOString(),
        intentos: 0,
        maxIntentos: 5
    };

    guardarSeguridad(seguridad);

    res.json({
        mensaje: '✅ Enlace protegido con contraseña',
        rid: rid,
        contrasena: pass,
        expiracion: fechaExpiracion.toISOString(),
        dias: expira
    });
});

// ============================================================
//  🔐 VERIFICAR CONTRASEÑA
// ============================================================
app.post('/api/verify', (req, res) => {
    const { rid, contrasena } = req.body;

    if (!rid || !contrasena) {
        return res.status(400).json({ error: 'Faltan datos' });
    }

    const seguridad = leerSeguridad();
    const config = seguridad[rid];

    if (!config) {
        return res.status(404).json({ error: 'RID no encontrado o no protegido' });
    }

    if (new Date(config.expiracion) < new Date()) {
        return res.status(403).json({ error: '❌ El enlace ha expirado' });
    }

    if (config.intentos >= config.maxIntentos) {
        return res.status(403).json({ error: '❌ Demasiados intentos fallidos' });
    }

    if (config.contrasena !== contrasena) {
        config.intentos++;
        guardarSeguridad(seguridad);
        return res.status(401).json({
            error: '❌ Contraseña incorrecta',
            intentos_restantes: config.maxIntentos - config.intentos
        });
    }

    config.intentos = 0;
    guardarSeguridad(seguridad);

    res.json({
        mensaje: '✅ Contraseña correcta',
        rid: rid
    });
});

// ============================================================
//  🚫 BLOQUEAR BOTS Y RASTREADORES
// ============================================================
function esBot(userAgent) {
    if (!userAgent) return false;
    const bots = [
        'bot', 'crawler', 'spider', 'googlebot', 'bingbot',
        'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
        'facebookexternalhit', 'twitterbot', 'linkedinbot',
        'whatsapp', 'telegram', 'discord', 'slack'
    ];
    return bots.some(b => userAgent.toLowerCase().includes(b));
}

// ============================================================
//  🔥 ENDPOINT PRINCIPAL (CON SEGURIDAD)
// ============================================================
app.get('/i/:rid/:nombreImagen', async (req, res) => {
    const { rid, nombreImagen } = req.params;
    const { device, pass } = req.query;

    // 🚫 BLOQUEAR BOTS
    const userAgent = req.headers['user-agent'] || '';
    if (esBot(userAgent)) {
        return res.status(404).send('Not Found');
    }

    // 🔒 VERIFICAR SEGURIDAD DEL RID
    const seguridad = leerSeguridad();
    const config = seguridad[rid];

    if (config) {
        if (new Date(config.expiracion) < new Date()) {
            return res.status(403).send(`
                <html>
                    <body style="background:#1a0a2e;display:flex;justify-content:center;align-items:center;height:100vh;color:#f87171;font-family:Arial;text-align:center;">
                        <div>
                            <h1>⏰ Enlace expirado</h1>
                            <p>Este enlace ya no está disponible</p>
                        </div>
                    </body>
                </html>
            `);
        }

        if (!pass) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>🔒 Enlace protegido</title>
                    <style>
                        * { margin:0; padding:0; box-sizing:border-box; font-family:Arial,sans-serif; }
                        body { background:#1a0a2e; min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px; }
                        .container { background:#2d1b4e; padding:40px; border-radius:16px; max-width:400px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.7); border:1px solid rgba(180,100,255,0.12); text-align:center; }
                        h1 { color:#d4b8ff; font-size:24px; margin-bottom:10px; }
                        p { color:#a890c8; font-size:14px; margin-bottom:20px; }
                        input { width:100%; padding:12px 16px; background:rgba(255,255,255,0.05); border:1px solid rgba(180,100,255,0.2); border-radius:10px; color:#e2d5f5; font-size:16px; margin-bottom:16px; text-align:center; }
                        input:focus { outline:none; border-color:#a855f7; box-shadow:0 0 0 3px rgba(168,85,247,0.12); }
                        button { width:100%; padding:12px; background:linear-gradient(135deg,#7c3aed,#6d28d9); color:white; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition:all 0.3s; }
                        button:hover { transform:translateY(-2px); box-shadow:0 6px 25px rgba(124,58,237,0.4); }
                        .emoji { font-size:48px; margin-bottom:15px; }
                        .info { color:#7c6a9e; font-size:12px; margin-top:15px; }
                        .error { color:#f87171; font-size:13px; margin-top:10px; display:none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">🔒</div>
                        <h1>Contenido protegido</h1>
                        <p>Introduce la contraseña para ver la imagen</p>
                        <form id="formPass">
                            <input type="password" id="passInput" placeholder="Contraseña..." required autofocus />
                            <button type="submit">🔓 Ver imagen</button>
                        </form>
                        <div class="info">💡 La contraseña te la ha proporcionado quien te envió el enlace</div>
                        <div class="error" id="errorMsg">❌ Contraseña incorrecta</div>
                    </div>
                    <script>
                        document.getElementById('formPass').addEventListener('submit', function(e) {
                            e.preventDefault();
                            const pass = document.getElementById('passInput').value.trim();
                            const error = document.getElementById('errorMsg');
                            if (!pass) return;

                            fetch('/api/verify', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rid: '${rid}', contrasena: pass })
                            })
                            .then(r => r.json())
                            .then(data => {
                                if (data.error) {
                                    error.textContent = data.error;
                                    error.style.display = 'block';
                                    if (data.intentos_restantes !== undefined) {
                                        error.textContent += \` (\${data.intentos_restantes} intentos restantes)\`;
                                    }
                                } else {
                                    const urlActual = window.location.href.split('?')[0];
                                    window.location.href = urlActual + '?pass=' + encodeURIComponent(pass);
                                }
                            })
                            .catch(() => {
                                error.textContent = '❌ Error al verificar';
                                error.style.display = 'block';
                            });
                        });
                    </script>
                </body>
                </html>
            `);
        }

        const configSeg = seguridad[rid];
        if (configSeg.contrasena !== pass) {
            return res.status(403).send(`
                <html>
                    <body style="background:#1a0a2e;display:flex;justify-content:center;align-items:center;height:100vh;color:#f87171;font-family:Arial;text-align:center;">
                        <div>
                            <h1>❌ Contraseña incorrecta</h1>
                            <p>No tienes permiso para ver esta imagen</p>
                        </div>
                    </body>
                </html>
            `);
        }
    }

    // SI EL RID ES UN ALIAS, OBTENER EL ORIGINAL
    const aliases = leerAliases();
    const ridOriginal = aliases[rid] || rid;

    let imgUrl;
    try {
        imgUrl = Buffer.from(nombreImagen.split('.')[0], 'base64').toString('utf-8');
    } catch (e) {
        return res.status(404).send('Not Found');
    }

    if (!ridOriginal || !imgUrl) {
        return res.status(404).send('Not Found');
    }

    // REGISTRAR VISITA
    try {
        let deviceInfo = {};
        if (device) {
            try {
                deviceInfo = JSON.parse(decodeURIComponent(device));
            } catch (e) {}
        }

        const ip = getClientIP(req);
        const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const geo = await getGeoLocation(ip);

        const db = leerDB();
        if (!db[ridOriginal]) db[ridOriginal] = [];

        db[ridOriginal].push({
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

    // REDIRIGIR A LA IMAGEN
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
        return res.redirect(imgUrl);
    }

    const imagePath = path.join(__dirname, imgUrl);
    if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
    }

    res.status(404).send('Not Found');
});

// ============================================================
//  📝 CREAR/RENOMBRAR ALIAS
// ============================================================
app.post('/api/alias', (req, res) => {
    const { rid, alias } = req.body;

    if (!rid || !alias) {
        return res.status(400).json({ error: 'Faltan parámetros: rid y alias son obligatorios' });
    }

    const db = leerDB();
    if (!db[rid]) {
        return res.status(404).json({ error: `El RID ${rid} no existe o no tiene registros` });
    }

    const aliases = leerAliases();
    if (aliases[alias] && aliases[alias] !== rid) {
        return res.status(400).json({ error: `El alias '${alias}' ya está en uso por otro RID` });
    }

    aliases[alias] = rid;
    guardarAliases(aliases);

    res.json({
        mensaje: `✅ Alias '${alias}' creado para el RID '${rid}'`,
        rid: rid,
        alias: alias
    });
});

// ============================================================
//  OBTENER REGISTROS
// ============================================================
app.get('/api/records/:rid', (req, res) => {
    let rid = req.params.rid;

    const aliases = leerAliases();
    if (aliases[rid]) {
        rid = aliases[rid];
    }

    const db = leerDB();
    const records = db[rid] || [];

    if (records.length === 0) {
        return res.status(404).json({ message: 'Sin registros' });
    }

    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({
        rid: rid,
        count: records.length,
        records
    });
});

// ============================================================
//  OBTENER INFO DE SEGURIDAD DE UN RID
// ============================================================
app.get('/api/security/:rid', (req, res) => {
    const { rid } = req.params;
    const seguridad = leerSeguridad();
    const config = seguridad[rid];

    if (!config) {
        return res.json({ protegido: false });
    }

    res.json({
        protegido: true,
        expiracion: config.expiracion,
        dias_restantes: Math.ceil((new Date(config.expiracion) - new Date()) / (1000 * 60 * 60 * 24))
    });
});

// ============================================================
//  INICIAR
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`🟣 Visor - Purple Edition v2.8 (Seguridad)`);
    console.log(`🔒 Enlaces protegidos con contraseña y expiración`);
    console.log(`🚫 Bloqueo de bots y rastreadores`);
});
