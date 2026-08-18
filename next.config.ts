import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
