import { io } from "socket.io-client";

// URL del backend (Sockets)
const SOCKET_URL = "http://localhost:3000";
const socket = io(SOCKET_URL);

const TRIP_ID = "viaje_demo_123";

// Ruta simulada en Lima (Coordenadas aproximadas por la Vía Expresa)
const route = [
    { lat: -12.046374, lng: -77.042793 },
    { lat: -12.052123, lng: -77.040112 },
    { lat: -12.058341, lng: -77.037564 },
    { lat: -12.065421, lng: -77.034321 },
    { lat: -12.072111, lng: -77.031555 },
    { lat: -12.080555, lng: -77.028444 },
];

let currentIndex = 0;

socket.on("connect", () => {
    console.log(`✅ Chofer simulador conectado al Servidor con ID: ${socket.id}`);
    console.log(`🚗 Iniciando transmisión GPS para el viaje: ${TRIP_ID}`);
    
    setInterval(() => {
        const point = route[currentIndex];
        
        const payload = {
            tripId: TRIP_ID,
            lat: point.lat,
            lng: point.lng,
            speed: Math.floor(Math.random() * 20) + 40, // 40-60 km/h
            bearing: 180 // Sur
        };

        console.log(`[Emisor] Enviando ubicación: ${point.lat}, ${point.lng}`);
        socket.emit("driver_update_location", payload);

        // Avanzar en la ruta (y volver a empezar si termina)
        currentIndex = (currentIndex + 1) % route.length;
    }, 3000); // Emite cada 3 segundos
});

socket.on("disconnect", () => {
    console.log("❌ Desconectado del servidor");
});
