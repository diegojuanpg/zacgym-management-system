import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cuanto vive en el navegador lo que ya se visito. En cero —el default de
    // Next para rutas dinamicas— volver a Mostrador desde Ventas es otra vuelta
    // entera al server: middleware, auth, consultas. Con 30 segundos, ir y
    // volver entre secciones no toca la red.
    //
    // El riesgo es ver algo viejo, y es chico: las mutaciones pasan todas por
    // server actions con revalidatePath, que invalidan este cache igual.
    staleTimes: { dynamic: 30, static: 180 },
  },

  // Sin esto Next bloquea sus assets de dev cuando entras por 127.0.0.1 en vez
  // de localhost: la pagina no hidrata y el form de login se manda como GET.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.117"],

  // La seccion se llamaba Incoherencias cuando solo mostraba lo que no cuadraba.
  // Ahora estan todos los turnos, pero puede haber un link viejo guardado.
  async redirects() {
    return [{ source: "/incoherencias", destination: "/turnos", permanent: true }];
  },
};

export default nextConfig;
