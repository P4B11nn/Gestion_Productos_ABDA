/**
 * Script para generar transacciones con patrones de compra claros
 * Este script creará nuevas transacciones con combinaciones recurrentes de productos
 * para que el algoritmo de patrones pueda detectar asociaciones significativas
 */

const mysql = require('mysql2/promise');

// Configuración de la conexión
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 5,
};

// Configuración de patrones predefinidos
const PATRONES_PREDEFINIDOS = [
  // [Productos que suelen comprarse juntos]
  // Patrón: Desayuno básico
  { 
    nombre: "Desayuno básico",
    productos: ["Leche", "Pan", "Huevos", "Café"],
    repeticiones: 180,
    variacion: 0.2 // 20% de variación
  },
  // Patrón: Limpieza hogar
  {
    nombre: "Limpieza hogar",
    productos: ["Detergente", "Suavizante", "Limpiador multiusos", "Esponja"],
    repeticiones: 150,
    variacion: 0.25
  },
  // Patrón: Preparación de pasta
  {
    nombre: "Pasta italiana",
    productos: ["Pasta", "Salsa de tomate", "Queso parmesano", "Albahaca"],
    repeticiones: 130,
    variacion: 0.3
  },
  // Patrón: Aseo personal
  {
    nombre: "Aseo personal",
    productos: ["Champú", "Acondicionador", "Jabón corporal", "Crema dental"],
    repeticiones: 200,
    variacion: 0.15
  },
  // Patrón: Fiesta
  {
    nombre: "Fiesta",
    productos: ["Refrescos", "Papas fritas", "Nachos", "Salsa"],
    repeticiones: 100,
    variacion: 0.4
  },
  // Patrón: Panadería
  {
    nombre: "Panadería",
    productos: ["Harina", "Levadura", "Azúcar", "Mantequilla"],
    repeticiones: 90,
    variacion: 0.35
  },
  // Patrón: Ensalada
  {
    nombre: "Ensalada fresca",
    productos: ["Lechuga", "Tomate", "Pepino", "Vinagre balsámico"],
    repeticiones: 120,
    variacion: 0.25
  },
  // Patrón: Cuidado bebé
  {
    nombre: "Cuidado bebé",
    productos: ["Pañales", "Toallitas húmedas", "Talco", "Champú para bebés"],
    repeticiones: 110,
    variacion: 0.2
  },
  // Patrón: Carne asada
  {
    nombre: "Carne asada",
    productos: ["Carne molida", "Carbón", "Salsa BBQ", "Pan para hamburguesa"],
    repeticiones: 95,
    variacion: 0.3
  },
  // Patrón: Limpieza facial
  {
    nombre: "Limpieza facial",
    productos: ["Limpiador facial", "Tónico", "Crema hidratante", "Mascarilla facial"],
    repeticiones: 85,
    variacion: 0.25
  }
];

// Fechas para las transacciones (últimos 3 meses)
function generarFechaReciente() {
  const ahora = new Date();
  const diasAtras = Math.floor(Math.random() * 90); // 0-90 días atrás
  ahora.setDate(ahora.getDate() - diasAtras);
  return ahora.toISOString().slice(0, 19).replace('T', ' ');
}

async function generarTransaccionesConPatrones() {
  let connection;

  try {
    console.log('Conectando a la base de datos tienda_bd...');
    connection = await mysql.createConnection(dbConfig);

    // 1. Obtener últimos IDs
    const [maxTransaccionId] = await connection.query('SELECT MAX(id) as maxId FROM Transacciones');
    const ultimoTransaccionId = maxTransaccionId[0].maxId || 0;
    
    const [maxDetalleId] = await connection.query('SELECT MAX(id) as maxId FROM DetalleTransaccion');
    const ultimoDetalleId = maxDetalleId[0].maxId || 0;
    
    // 2. Verificar tablas dimensionales
    console.log('\nVerificando tablas dimensionales necesarias...');
    const [dimensionFechas] = await connection.query('SELECT COUNT(*) as count FROM DimensionFechas');
    if (dimensionFechas[0].count === 0) {
      throw new Error('La tabla DimensionFechas está vacía. Ejecute primero crear-tablas-dimensionales.sql');
    }
    
    // 3. Buscar productos que coincidan con los patrones
    console.log('\nBuscando productos para los patrones...');
    const mapaProductos = new Map();
    const patronesConProductos = [];
    
    // Recorremos cada patrón definido
    for (const patron of PATRONES_PREDEFINIDOS) {
      const productosEncontrados = [];
      
      // Buscamos productos para cada término del patrón
      for (const terminoProducto of patron.productos) {
        if (mapaProductos.has(terminoProducto)) {
          productosEncontrados.push(mapaProductos.get(terminoProducto));
          continue;
        }
        
        // Buscar en la base de datos
        const [productos] = await connection.query(
          'SELECT producto_id, nombre, precio_actual FROM DimensionProductos WHERE nombre LIKE ? LIMIT 1',
          [`%${terminoProducto}%`]
        );
        
        if (productos.length > 0) {
          mapaProductos.set(terminoProducto, productos[0]);
          productosEncontrados.push(productos[0]);
        } else {
          console.log(`⚠️ No se encontró producto para el término "${terminoProducto}", buscando alternativa...`);
          
          // Buscar alternativas en la misma categoría
          const categorias = ['Comida', 'Alimentos', 'Aseo', 'Limpieza', 'Bebidas', 'Lácteos'];
          const categoriaProbable = terminoProducto.toLowerCase().includes('champú') || 
                                  terminoProducto.toLowerCase().includes('jabon') ? 
                                  'Aseo' : 'Alimentos';
          
          const [alternativas] = await connection.query(
            'SELECT producto_id, nombre, precio_actual FROM DimensionProductos WHERE categoria LIKE ? ORDER BY RAND() LIMIT 1',
            [`%${categoriaProbable}%`]
          );
          
          if (alternativas.length > 0) {
            console.log(`✅ Usando "${alternativas[0].nombre}" como alternativa para "${terminoProducto}"`);
            mapaProductos.set(terminoProducto, alternativas[0]);
            productosEncontrados.push(alternativas[0]);
          } else {
            console.log(`❌ No se pudo encontrar alternativa para "${terminoProducto}"`);
          }
        }
      }
      
      // Si encontramos al menos 2 productos para el patrón, lo agregamos
      if (productosEncontrados.length >= 2) {
        patronesConProductos.push({
          ...patron,
          productosEncontrados
        });
      }
    }
    
    console.log(`\nSe encontraron ${patronesConProductos.length} patrones válidos para generar transacciones`);
    
    // 4. Generar transacciones basadas en patrones
    console.log('\n=== GENERANDO TRANSACCIONES CON PATRONES ===');
    let transaccionesCreadas = 0;
    let detallesCreados = 0;
    
    for (const patron of patronesConProductos) {
      console.log(`\nGenerando transacciones para patrón: ${patron.nombre}`);
      console.log(`Productos: ${patron.productosEncontrados.map(p => p.nombre).join(', ')}`);
      console.log(`Objetivo: ${patron.repeticiones} transacciones con variaciones`);
      
      // Calculamos cuántas transacciones crear para este patrón
      const transaccionesObjetivo = patron.repeticiones;
      let transaccionesPatron = 0;
      
      while (transaccionesPatron < transaccionesObjetivo) {
        const lote = Math.min(100, transaccionesObjetivo - transaccionesPatron);
        
        // Crear transacciones en lotes
        console.log(`  Generando lote de ${lote} transacciones...`);
        
        // Preparar valores para inserción masiva
        const valoresTransacciones = [];
        const detallesTransacciones = [];
        
        for (let i = 0; i < lote; i++) {
          // Crear una nueva transacción
          const nuevaTransaccionId = ultimoTransaccionId + transaccionesCreadas + 1;
          const clienteId = Math.floor(Math.random() * 1000) + 1; // Asumiendo que hay 1000 clientes
          const fechaTransaccion = generarFechaReciente();
          
          // Decidir qué productos incluir en esta transacción (con variación)
          const productosTransaccion = [...patron.productosEncontrados];
          
          // Aplicar variación: posiblemente quitar algunos productos
          if (patron.variacion > 0) {
            for (let j = productosTransaccion.length - 1; j >= 0; j--) {
              if (Math.random() < patron.variacion && productosTransaccion.length > 2) {
                productosTransaccion.splice(j, 1);
              }
            }
          }
          
          // Calcular total de la transacción
          let totalTransaccion = 0;
          
          // Crear detalles para cada producto en la transacción
          for (const producto of productosTransaccion) {
            const cantidad = Math.floor(Math.random() * 3) + 1; // 1-3 unidades
            const precioUnitario = producto.precio_actual;
            const subtotal = cantidad * precioUnitario;
            totalTransaccion += subtotal;
            
            const nuevoDetalleId = ultimoDetalleId + detallesCreados + 1;
            detallesTransacciones.push([
              nuevoDetalleId,
              nuevaTransaccionId,
              producto.producto_id,
              cantidad,
              precioUnitario
            ]);
            
            detallesCreados++;
          }
          
          // Agregar productos aleatorios (20% de probabilidad)
          if (Math.random() < 0.2) {
            const productosAleatorios = Math.floor(Math.random() * 2) + 1; // 1-2 productos aleatorios
            for (let j = 0; j < productosAleatorios; j++) {
              const productoId = Math.floor(Math.random() * 30000) + 1; // Producto aleatorio
              const cantidad = Math.floor(Math.random() * 2) + 1; // 1-2 unidades
              
              // Obtener precio del producto
              const [precioInfo] = await connection.query(
                'SELECT precio_actual FROM DimensionProductos WHERE producto_id = ?',
                [productoId]
              );
              
              if (precioInfo.length > 0) {
                const precioUnitario = precioInfo[0].precio_actual;
                const subtotal = cantidad * precioUnitario;
                totalTransaccion += subtotal;
                
                const nuevoDetalleId = ultimoDetalleId + detallesCreados + 1;
                detallesTransacciones.push([
                  nuevoDetalleId,
                  nuevaTransaccionId,
                  productoId,
                  cantidad,
                  precioUnitario
                ]);
                
                detallesCreados++;
              }
            }
          }
          
          // Formato: (id, cliente_id, fecha_transaccion, total_transaccion)
          valoresTransacciones.push([
            nuevaTransaccionId,
            clienteId,
            fechaTransaccion,
            totalTransaccion
          ]);
          
          transaccionesCreadas++;
        }
        
        // Insertar transacciones en la base de datos
        const sqlTransacciones = `INSERT INTO Transacciones (id, cliente_id, fecha_transaccion, total_transaccion) VALUES ?`;
        await connection.query(sqlTransacciones, [valoresTransacciones]);
        
        // Insertar detalles de transacciones
        const sqlDetalles = `INSERT INTO DetalleTransaccion (id, transaccion_id, producto_id, cantidad, precio_unitario_venta) VALUES ?`;
        await connection.query(sqlDetalles, [detallesTransacciones]);
        
        transaccionesPatron += lote;
        console.log(`  ✅ Lote completado. Total de transacciones para este patrón: ${transaccionesPatron}`);
      }
    }
    
    console.log(`\n=== ACTUALIZANDO TABLAS DIMENSIONALES ===`);
    // 5. Verificar y actualizar tablas dimensionales
    // Primero verificar la estructura de DimensionFechas
    console.log('Verificando estructura de DimensionFechas...');
    const [columnasFechas] = await connection.query('SHOW COLUMNS FROM DimensionFechas');
    const nombreColumnas = columnasFechas.map(col => col.Field);
    console.log(`Columnas en DimensionFechas: ${nombreColumnas.join(', ')}`);
    
    // Actualizar DimensionFechas con las nuevas fechas
    console.log('Actualizando DimensionFechas...');
    
    // Construir el SQL dinámicamente basado en las columnas disponibles
    let sqlColumnas = 'fecha, dia, mes, anio';
    let sqlValues = 'DISTINCT DATE(fecha_transaccion) as fecha, DAY(fecha_transaccion) as dia, MONTH(fecha_transaccion) as mes, YEAR(fecha_transaccion) as anio';
    
    if (nombreColumnas.includes('trimestre')) {
      sqlColumnas += ', trimestre';
      sqlValues += ', QUARTER(fecha_transaccion) as trimestre';
    }
    
    if (nombreColumnas.includes('dia_semana')) {
      sqlColumnas += ', dia_semana';
      sqlValues += ', DAYOFWEEK(fecha_transaccion) as dia_semana';
    }
    
    await connection.query(`
      INSERT IGNORE INTO DimensionFechas (${sqlColumnas})
      SELECT ${sqlValues} FROM Transacciones
    `);
    
    // 6. Actualizar HechosVentas con las nuevas transacciones
    console.log('Actualizando HechosVentas...');
    await connection.query(`
      INSERT INTO HechosVentas (transaccion_id, producto_id, cliente_id, fecha_id, cantidad_vendida, precio_unitario, subtotal)
      SELECT 
        dt.transaccion_id,
        dt.producto_id,
        t.cliente_id,
        df.fecha_id,
        dt.cantidad,
        dt.precio_unitario_venta,
        dt.cantidad * dt.precio_unitario_venta AS subtotal
      FROM DetalleTransaccion dt
      JOIN Transacciones t ON dt.transaccion_id = t.id
      JOIN DimensionFechas df ON DATE(t.fecha_transaccion) = df.fecha
      WHERE dt.transaccion_id > ${ultimoTransaccionId}
    `);
    
    // 7. Verificar las nuevas transacciones
    const [transaccionesCount] = await connection.query('SELECT COUNT(*) as count FROM Transacciones');
    const [detallesCount] = await connection.query('SELECT COUNT(*) as count FROM DetalleTransaccion');
    const [hechosVentasCount] = await connection.query('SELECT COUNT(*) as count FROM HechosVentas');
    
    console.log(`\n=== RESUMEN DE LA OPERACIÓN ===`);
    console.log(`Transacciones generadas: ${transaccionesCreadas}`);
    console.log(`Detalles de transacción generados: ${detallesCreados}`);
    console.log(`Total de transacciones en la base de datos: ${transaccionesCount[0].count}`);
    console.log(`Total de detalles de transacción: ${detallesCount[0].count}`);
    console.log(`Total de registros en HechosVentas: ${hechosVentasCount[0].count}`);
    
    console.log(`\nAhora puede ejecutar el procedimiento CalcularPatronesCompra`);
    console.log('Para ejecutarlo, use: node ejecutar-patrones.js');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Ejecutar el script
console.time('Tiempo de ejecución');
generarTransaccionesConPatrones().then(() => {
  console.timeEnd('Tiempo de ejecución');
});