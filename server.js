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

// ============ BASE DE DATOS ============
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

// ============ ALIASES ============
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

// ============ OBTENER IP REAL ============
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.headers['cf-connecting-ip'] ||
        req.connection.remoteAddress ||
        '0.0.0.0';
}

// ============ GEOLOCALIZACIÓN ============
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

    // Si el RID es un alias, obtener el RID original
    const aliases = leerAliases();
    const ridOriginal = aliases[rid] || rid;

    let imgUrl;
    try {
        imgUrl = Buffer.from(nombreImagen.split('.')[0], 'base64').toString('utf-8');
    } catch (e) {
        return res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Imagen+no+valida');
    }

    if (!ridOriginal || !imgUrl) {
        return res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Error');
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

    // ============ REDIRIGIR A LA IMAGEN ============
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
        return res.redirect(imgUrl);
    }

    const imagePath = path.join(__dirname, imgUrl);
    if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
    }

    res.redirect('https://via.placeholder.com/400x300/1a0a2e/6ee7b7?text=Imagen+no+encontrada');
});

// ============================================================
//  📝 CREAR/RENOMBRAR ALIAS
// ============================================================
app.post('/api/alias', (req, res) => {
    const { rid, alias } = req.body;

    console.log(`📝 Recibida petición de renombrar: rid=${rid}, alias=${alias}`);

    if (!rid || !alias) {
        console.log('❌ Faltan parámetros');
        return res.status(400).json({ error: 'Faltan parámetros: rid y alias son obligatorios' });
    }

    // Verificar que el RID existe (tiene registros)
    const db = leerDB();
    if (!db[rid]) {
        console.log(`❌ El RID ${rid} no existe en la base de datos`);
        return res.status(404).json({ error: `El RID ${rid} no existe o no tiene registros` });
    }

    // Verificar que el alias no esté ya usado por otro RID
    const aliases = leerAliases();
    if (aliases[alias] && aliases[alias] !== rid) {
        console.log(`❌ El alias '${alias}' ya está en uso por otro RID`);
        return res.status(400).json({ error: `El alias '${alias}' ya está en uso por otro RID` });
    }

    // Guardar el alias
    aliases[alias] = rid;
    guardarAliases(aliases);

    console.log(`✅ Alias '${alias}' creado para el RID '${rid}'`);
    res.json({
        mensaje: `✅ Alias '${alias}' creado para el RID '${rid}'`,
        rid: rid,
        alias: alias
    });
});

// ============================================================
//  📋 OBTENER ALIAS DE UN RID
// ============================================================
app.get('/api/alias/:rid', (req, res) => {
    const { rid } = req.params;
    const aliases = leerAliases();

    const aliasList = [];
    Object.keys(aliases).forEach(key => {
        if (aliases[key] === rid) {
            aliasList.push(key);
        }
    });

    res.json({
        rid: rid,
        aliases: aliasList
    });
});

// ============================================================
//  📋 OBTENER TODOS LOS ALIASES
// ============================================================
app.get('/api/aliases', (req, res) => {
    const aliases = leerAliases();
    res.json(aliases);
});

// ============================================================
//  🗑️ ELIMINAR ALIAS
// ============================================================
app.delete('/api/alias/:alias', (req, res) => {
    const { alias } = req.params;
    const aliases = leerAliases();

    if (!aliases[alias]) {
        return res.status(404).json({ error: `El alias '${alias}' no existe` });
    }

    delete aliases[alias];
    guardarAliases(aliases);

    res.json({
        mensaje: `✅ Alias '${alias}' eliminado correctamente`
    });
});

// ============================================================
//  OBTENER REGISTROS (con soporte para alias)
// ============================================================
app.get('/api/records/:rid', (req, res) => {
    let rid = req.params.rid;

    // Verificar si es un alias
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
//  INICIAR
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`🟣 Visor - Purple Edition v2.7`);
    console.log(`📝 Función de renombrar RIDs activada`);
});
