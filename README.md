<<<<<<< HEAD
# Gestion_Productos_ABDA
Aplicacion Web para la gestion y control de ventas 
=======
# Aplicación de Análisis de Productos

## Configuración inicial

1. Asegúrate de tener instalado Node.js y MySQL.
2. Configura tu base de datos MySQL:
   - Crea una base de datos llamada `tienda_bd`
   - Ejecuta los scripts SQL en este orden:
     - `TIENDABD.sql` - Crea las tablas básicas
     - `productos_transacciones_etc.sql` - Carga datos iniciales
     - `hechos_dimensiones.sql` - Crea tablas dimensionales

3. Instala las dependencias del proyecto:
   ```
   npm install
   ```

4. Configura tus credenciales de MySQL:
   - Abre `server.js` y modifica las líneas de conexión con tus credenciales:
   ```javascript
   const pool = mysql.createPool({
     host: 'localhost',
     user: 'TU_USUARIO',
     password: 'TU_PASSWORD',
     database: 'tienda_bd',
     // ...
   });
   ```

## Probar la conexión a la base de datos

Para verificar que la conexión a la base de datos funciona correctamente:

```
node test-db.js
```

Deberías ver varios mensajes de confirmación. Si aparece algún error, revisa tu configuración de MySQL.

## Iniciar el servidor

Para iniciar el servidor de la aplicación:

```
npm start
```

La aplicación estará disponible en http://localhost:3000

## Verificar el estado del sistema

Para verificar que todo funciona correctamente, abre en tu navegador:

http://localhost:3000/api/health-check

Deberías ver un JSON con información sobre el estado del servidor y la base de datos.

## Probar la API de indicadores

Para probar la API de indicadores, usa esta URL (reemplaza el número por un ID de producto válido):

http://localhost:3000/api/productos/25/indicadores

## Visualizar la interfaz

Para ver la interfaz de usuario, simplemente abre:

http://localhost:3000
>>>>>>> 5670ef7 (Version 1.10)
