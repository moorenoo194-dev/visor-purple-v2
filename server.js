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
//  🔥 CONFIGURACIÓN DE SUPABASE (TUS DATOS)
// ============================================================
const SUPABASE_URL = 'https://cjfwowcbuuozeefmdqln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZndvd2NidXVvemVlZm1kcWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTcxNzMsImV4cCI6MjA5ODQ3MzE3M30.zWNTmg6rZCFpjwrY99RvzgGmtAvVZAM9_5X_ss4OszA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
//  OBTENER IP REAL
// ============================================================
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.headers['cf-connecting-ip'] ||
        req.connection.remoteAddress ||
        '0.0.0.0';
}

// ============================================================
//  GEOLOCALIZACIÓN
// ============================================================
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
//  🚫 BLOQUEAR BOTS
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
//  🔥 ENDPOINT PRINCIPAL
// ============================================================
app.get('/i/:rid/:nombreImagen', async (req, res) => {
    const { rid, nombreImagen } = req.params;
    const { device, pass } = req.query;

    const userAgent = req.headers['user-agent'] || '';
    if (esBot(userAgent)) {
        return res.status(404).send('Not Found');
    }

    // 🔒 VERIFICAR SEGURIDAD
    const { data: seguridad, error: secError } = await supabase
        .from('seguridad')
        .select('*')
        .eq('rid', rid)
        .single();

    if (seguridad) {
        if (new Date(seguridad.expiracion) < new Date()) {
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

        const { data: verifyData } = await supabase
            .from('seguridad')
            .select('*')
            .eq('rid', rid)
            .single();

        if (verifyData.contrasena !== pass) {
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

    // VERIFICAR ALIAS
    const { data: aliasData } = await supabase
        .from('aliases')
        .select('rid')
        .eq('alias', rid)
        .single();

    const ridOriginal = aliasData?.rid || rid;

    let imgUrl;
    try {
        imgUrl = Buffer.from(nombreImagen.split('.')[0], 'base64').toString('utf-8');
    } catch (e) {
        return res.status(404).send('Not Found');
    }

    if (!ridOriginal || !imgUrl) {
        return res.status(404).send('Not Found');
    }

    // ============ REGISTRAR VISITA ============
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

        const { error } = await supabase
            .from('registros')
            .insert([
                {
                    rid: ridOriginal,
                    ip: ip,
                    fecha: date,
                    pais: geo.pais,
                    region: geo.region,
                    ciudad: geo.ciudad,
                    coordenadas: `${geo.lat}, ${geo.lon}`,
                    dispositivo: deviceInfo.tipo || userAgent,
                    imagen: imgUrl
                }
            ]);

        if (error) {
            console.error('❌ Error guardando en Supabase:', error);
        } else {
            console.log(`✅ Visita registrada para RID: ${ridOriginal} desde IP: ${ip}`);
        }
    } catch (e) {
        console.error('❌ Error registrando visita:', e);
    }

    // ============ REDIRIGIR A LA IMAGEN ============
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
//  🔐 VERIFICAR CONTRASEÑA
// ============================================================
app.post('/api/verify', async (req, res) => {
    const { rid, contrasena } = req.body;

    if (!rid || !contrasena) {
        return res.status(400).json({ error: 'Faltan datos' });
    }

    const { data: config, error } = await supabase
        .from('seguridad')
        .select('*')
        .eq('rid', rid)
        .single();

    if (!config) {
        return res.status(404).json({ error: 'RID no encontrado o no protegido' });
    }

    if (new Date(config.expiracion) < new Date()) {
        return res.status(403).json({ error: '❌ El enlace ha expirado' });
    }

    if (config.intentos >= config.max_intentos) {
        return res.status(403).json({ error: '❌ Demasiados intentos fallidos' });
    }

    if (config.contrasena !== contrasena) {
        await supabase
            .from('seguridad')
            .update({ intentos: config.intentos + 1 })
            .eq('rid', rid);

        return res.status(401).json({
            error: '❌ Contraseña incorrecta',
            intentos_restantes: config.max_intentos - config.intentos - 1
        });
    }

    await supabase
        .from('seguridad')
        .update({ intentos: 0 })
        .eq('rid', rid);

    res.json({
        mensaje: '✅ Contraseña correcta',
        rid: rid
    });
});

// ============================================================
//  📝 CREAR/RENOMBRAR ALIAS
// ============================================================
app.post('/api/alias', async (req, res) => {
    const { rid, alias } = req.body;

    console.log(`📝 Recibida petición de renombrar: rid=${rid}, alias=${alias}`);

    if (!rid || !alias) {
        return res.status(400).json({ error: 'Faltan parámetros: rid y alias son obligatorios' });
    }

    // Verificar que el RID existe (tiene registros)
    const { data: registros, error: regError } = await supabase
        .from('registros')
        .select('rid')
        .eq('rid', rid)
        .limit(1);

    if (!registros || registros.length === 0) {
        return res.status(404).json({ error: `El RID ${rid} no existe o no tiene registros` });
    }

    // Verificar que el alias no esté ya usado
    const { data: aliasExistente } = await supabase
        .from('aliases')
        .select('alias')
        .eq('alias', alias)
        .single();

    if (aliasExistente) {
        return res.status(400).json({ error: `El alias '${alias}' ya está en uso` });
    }

    // Guardar el alias
    const { error } = await supabase
        .from('aliases')
        .insert([{ alias, rid }]);

    if (error) {
        console.error('❌ Error guardando alias:', error);
        return res.status(500).json({ error: 'Error al guardar el alias' });
    }

    console.log(`✅ Alias '${alias}' creado para el RID '${rid}'`);
    res.json({
        mensaje: `✅ Alias '${alias}' creado para el RID '${rid}'`,
        rid: rid,
        alias: alias
    });
});

// ============================================================
//  🔒 PROTEGER ENLACE
// ============================================================
app.post('/api/secure', async (req, res) => {
    const { rid, contrasena, expiracion } = req.body;

    if (!rid) {
        return res.status(400).json({ error: 'Falta el RID' });
    }

    // Verificar que el RID existe
    const { data: registros, error: regError } = await supabase
        .from('registros')
        .select('rid')
        .eq('rid', rid)
        .limit(1);

    if (!registros || registros.length === 0) {
        return res.status(404).json({ error: `El RID ${rid} no existe o no tiene registros` });
    }

    const pass = contrasena || generarContrasena();
    const expira = expiracion || 7;

    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + expira);

    const { error } = await supabase
        .from('seguridad')
        .upsert({
            rid: rid,
            contrasena: pass,
            creado: new Date().toISOString(),
            expiracion: fechaExpiracion.toISOString(),
            intentos: 0,
            max_intentos: 5
        }, { onConflict: 'rid' });

    if (error) {
        console.error('❌ Error guardando seguridad:', error);
        return res.status(500).json({ error: 'Error al proteger el enlace' });
    }

    res.json({
        mensaje: '✅ Enlace protegido con contraseña',
        rid: rid,
        contrasena: pass,
        expiracion: fechaExpiracion.toISOString(),
        dias: expira
    });
});

// ============================================================
//  OBTENER REGISTROS
// ============================================================
app.get('/api/records/:rid', async (req, res) => {
    let rid = req.params.rid;

    // Verificar si es un alias
    const { data: aliasData } = await supabase
        .from('aliases')
        .select('rid')
        .eq('alias', rid)
        .single();

    if (aliasData) {
        rid = aliasData.rid;
    }

    const { data: records, error } = await supabase
        .from('registros')
        .select('*')
        .eq('rid', rid)
        .order('fecha', { ascending: false });

    if (error) {
        console.error('❌ Error obteniendo registros:', error);
        return res.status(500).json({ error: 'Error al obtener los registros' });
    }

    if (!records || records.length === 0) {
        return res.status(404).json({ message: 'Sin registros' });
    }

    res.json({
        rid: rid,
        count: records.length,
        records
    });
});

// ============================================================
//  OBTENER INFO DE SEGURIDAD
// ============================================================
app.get('/api/security/:rid', async (req, res) => {
    const { rid } = req.params;

    const { data: config, error } = await supabase
        .from('seguridad')
        .select('*')
        .eq('rid', rid)
        .single();

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
//  🚀 INICIAR EL SERVIDOR
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`🟣 Visor - Purple Edition v3.0 (Supabase)`);
    console.log(`📁 Datos guardados en Supabase (permanentes)`);
    console.log(`🔒 Enlaces protegidos con contraseña y expiración`);
    console.log(`🚫 Bloqueo de bots y rastreadores`);
});
