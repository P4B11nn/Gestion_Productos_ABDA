/**
 * Script para generar transacciones adicionales para los nuevos productos
 * Incluye patrones de compra realistas y datos históricos de 6 meses
 */

const mysql = require('mysql2/promise');

// Configuración de la conexión
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Función para generar un número entero aleatorio entre dos valores
function enteroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Función para generar una fecha aleatoria en los últimos 6 meses
function fechaAleatoria() {
  const ahora = new Date();
  const hace6Meses = new Date();
  hace6Meses.setMonth(ahora.getMonth() - 6);
  
  const tiempoAleatorio = hace6Meses.getTime() + Math.random() * (ahora.getTime() - hace6Meses.getTime());
  return new Date(tiempoAleatorio);
}

// Función para generar una hora aleatoria
function horaAleatoria() {
  const hora = enteroAleatorio(8, 22); // Horario comercial 8 AM - 10 PM
  const minuto = enteroAleatorio(0, 59);
  const segundo = enteroAleatorio(0, 59);
  return `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}:${segundo.toString().padStart(2, '0')}`;
}

// Función para generar transacciones masivas
async function generarTransaccionesMasivas(pool) {
  console.time('Generación de transacciones');

  try {
    console.log('=== GENERANDO TRANSACCIONES PARA NUEVOS PRODUCTOS ===');
    
    // Obtener productos nuevos (ID > 30000)
    const [productosNuevos] = await pool.query(`
      SELECT id, nombre, CAST(precio_actual AS DECIMAL(10,2)) as precio_actual, estado as categoria, stock_actual
      FROM Productos 
      WHERE id > 30000 
      AND precio_actual > 0
      ORDER BY id
    `);
    
    console.log(`Productos nuevos encontrados: ${productosNuevos.length}`);

    // Obtener el último ID de transacción
    const [ultimaTransaccion] = await pool.query('SELECT MAX(id) as max_id FROM Transacciones');
    let siguienteTransaccionId = (ultimaTransaccion[0].max_id || 0) + 1;

    // Generar transacciones para 60 días (últimos 2 meses)
    const totalTransacciones = 15000; // Unas 250 transacciones por día en promedio
    console.log(`Generando ${totalTransacciones} transacciones...`);

    let transaccionesGeneradas = 0;
    const batchSize = 1000;
    let valoresTransacciones = [];
    let valoresDetalles = [];

    for (let i = 0; i < totalTransacciones; i++) {
      const fechaTransaccion = fechaAleatoria();
      const horaTransaccion = horaAleatoria();
      const fechaHora = `${fechaTransaccion.toISOString().slice(0, 10)} ${horaTransaccion}`;
      
      // Número de productos por transacción (1-8 productos)
      const numProductos = enteroAleatorio(1, 8);
      
      // Seleccionar productos aleatorios sin repetir
      const productosEnTransaccion = [];
      const productosSeleccionados = new Set();
      
      for (let j = 0; j < numProductos; j++) {
        let productoAleatorio;
        do {
          productoAleatorio = productosNuevos[enteroAleatorio(0, productosNuevos.length - 1)];
        } while (productosSeleccionados.has(productoAleatorio.id));
        
        productosSeleccionados.add(productoAleatorio.id);
        
        // Cantidad vendida (1-5 unidades por producto)
        const cantidad = enteroAleatorio(1, 5);
        
        // Aplicar descuentos ocasionales (10% de las veces)
        let precioFinal = parseFloat(productoAleatorio.precio_actual) || 0;
        if (Math.random() < 0.1) {
          const descuento = Math.random() * 0.2 + 0.05; // 5-25% de descuento
          precioFinal = precioFinal * (1 - descuento);
        }
        
        productosEnTransaccion.push({
          producto_id: productoAleatorio.id,
          cantidad: cantidad,
          precio_unitario: parseFloat(precioFinal.toFixed(2)),
          subtotal: parseFloat((cantidad * precioFinal).toFixed(2))
        });
      }
      
      // Calcular total de la transacción
      const totalTransaccion = productosEnTransaccion.reduce((sum, item) => {
        return sum + parseFloat(item.subtotal);
      }, 0);
      
      // Insertar transacción
      valoresTransacciones.push(
        `(${siguienteTransaccionId}, '${fechaHora}', ${totalTransaccion.toFixed(2)})`
      );
      
      // Insertar detalles de transacción
      productosEnTransaccion.forEach(detalle => {
        valoresDetalles.push(
          `(${siguienteTransaccionId}, ${detalle.producto_id}, ${detalle.cantidad}, ${parseFloat(detalle.precio_unitario).toFixed(2)})`
        );
      });
      
      siguienteTransaccionId++;
      transaccionesGeneradas++;
      
      // Insertar en lotes
      if (transaccionesGeneradas % batchSize === 0 || i === totalTransacciones - 1) {
        // Insertar transacciones
        if (valoresTransacciones.length > 0) {
          await pool.query(`
            INSERT INTO Transacciones (id, fecha_transaccion, total_transaccion)
            VALUES ${valoresTransacciones.join(',')}
          `);
          valoresTransacciones = [];
        }
        
        // Insertar detalles
        if (valoresDetalles.length > 0) {
          await pool.query(`
            INSERT INTO DetalleTransaccion (transaccion_id, producto_id, cantidad, precio_unitario_venta)
            VALUES ${valoresDetalles.join(',')}
          `);
          valoresDetalles = [];
        }
        
        console.log(`  Progreso: ${transaccionesGeneradas}/${totalTransacciones} transacciones generadas`);
      }
    }

    console.log('\n=== GENERANDO PATRONES DE COMPRA ADICIONALES ===');
    
    // Generar transacciones con patrones específicos
    const patronesEspeciales = [
      {
        nombre: 'Compra familiar de fin de semana',
        productos: ['Lácteos', 'Panadería', 'Carnes', 'Frutas', 'Verduras'],
        cantidad_min: 8,
        cantidad_max: 15,
        frecuencia: 50
      },
      {
        nombre: 'Compra de despensa',
        productos: ['Conservas', 'Cereales', 'Aceites', 'Condimentos'],
        cantidad_min: 4,
        cantidad_max: 8,
        frecuencia: 30
      },
      {
        nombre: 'Compra de aseo completa',
        productos: ['Limpieza Hogar', 'Cuidado Personal', 'Papel', 'Detergentes'],
        cantidad_min: 5,
        cantidad_max: 10,
        frecuencia: 25
      },
      {
        nombre: 'Compra de snacks y bebidas',
        productos: ['Snacks', 'Bebidas', 'Dulces'],
        cantidad_min: 3,
        cantidad_max: 6,
        frecuencia: 40
      }
    ];

    for (const patron of patronesEspeciales) {
      console.log(`Generando patrón: ${patron.nombre} (${patron.frecuencia} transacciones)`);
      
      for (let i = 0; i < patron.frecuencia; i++) {
        const fechaTransaccion = fechaAleatoria();
        const horaTransaccion = horaAleatoria();
        const fechaHora = `${fechaTransaccion.toISOString().slice(0, 10)} ${horaTransaccion}`;
        
        // Obtener productos de las categorías del patrón
        const [productosPatron] = await pool.query(`
          SELECT id, CAST(precio_actual AS DECIMAL(10,2)) as precio_actual FROM Productos 
          WHERE estado IN (${patron.productos.map(cat => `'${cat}'`).join(',')})
          AND id > 30000
          AND precio_actual > 0
          ORDER BY RAND()
          LIMIT ${enteroAleatorio(patron.cantidad_min, patron.cantidad_max)}
        `);
        
        if (productosPatron.length === 0) continue;
        
        let totalTransaccion = 0;
        let detallesPatron = [];
        
        productosPatron.forEach(producto => {
          const cantidad = enteroAleatorio(1, 3);
          const precioUnitario = parseFloat(producto.precio_actual) || 0;
          const subtotal = cantidad * precioUnitario;
          totalTransaccion += subtotal;
          
          detallesPatron.push(
            `(${siguienteTransaccionId}, ${producto.id}, ${cantidad}, ${precioUnitario.toFixed(2)})`
          );
        });
        
        // Insertar transacción del patrón
        await pool.query(`
          INSERT INTO Transacciones (id, fecha_transaccion, total_transaccion)
          VALUES (${siguienteTransaccionId}, '${fechaHora}', ${totalTransaccion.toFixed(2)})
        `);
        
        // Insertar detalles del patrón
        await pool.query(`
          INSERT INTO DetalleTransaccion (transaccion_id, producto_id, cantidad, precio_unitario_venta)
          VALUES ${detallesPatron.join(',')}
        `);
        
        siguienteTransaccionId++;
      }
    }

    console.log('\n=== ACTUALIZANDO STOCK DE PRODUCTOS ===');
    
    // Actualizar stock de productos basado en las ventas
    await pool.query(`
      UPDATE Productos p
      SET stock_actual = stock_actual - COALESCE((
        SELECT SUM(dt.cantidad)
        FROM DetalleTransaccion dt
        WHERE dt.producto_id = p.id
      ), 0)
      WHERE p.id > 30000
      AND p.stock_actual > 0
    `);

    console.log('Stock de productos actualizado correctamente');

  } catch (error) {
    console.error('Error al generar transacciones:', error);
    throw error;
  }

  console.timeEnd('Generación de transacciones');
}

// Función principal
async function main() {
  try {
    console.log('Iniciando generación de transacciones para nuevos productos...');
    
    // Crear pool de conexiones
    const pool = mysql.createPool(dbConfig);

    // Verificar la conexión
    await pool.query('SELECT 1');
    console.log('Conexión a la base de datos establecida correctamente');

    // Verificar conteo de transacciones antes
    const [transaccionesAntes] = await pool.query('SELECT COUNT(*) as total FROM Transacciones');
    console.log(`Transacciones antes: ${transaccionesAntes[0].total}`);

    // Generar transacciones masivas
    await generarTransaccionesMasivas(pool);

    // Verificar conteo final
    const [transaccionesDespues] = await pool.query('SELECT COUNT(*) as total FROM Transacciones');
    console.log(`\nTransacciones después: ${transaccionesDespues[0].total}`);
    console.log(`Nuevas transacciones generadas: ${transaccionesDespues[0].total - transaccionesAntes[0].total}`);

    // Estadísticas finales
    const [estadisticas] = await pool.query(`
      SELECT 
        COUNT(DISTINCT t.id) as total_transacciones,
        COUNT(DISTINCT dt.producto_id) as productos_vendidos,
        SUM(t.total_transaccion) as ingresos_totales,
        AVG(t.total_transaccion) as ticket_promedio
      FROM Transacciones t
      JOIN DetalleTransaccion dt ON t.id = dt.transaccion_id
      WHERE dt.producto_id > 30000
    `);

    console.log('\n=== ESTADÍSTICAS DE NUEVAS TRANSACCIONES ===');
    console.log(`Total de transacciones con nuevos productos: ${estadisticas[0].total_transacciones}`);
    console.log(`Productos nuevos vendidos: ${estadisticas[0].productos_vendidos}`);
    console.log(`Ingresos generados: $${parseFloat(estadisticas[0].ingresos_totales || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}`);
    console.log(`Ticket promedio: $${parseFloat(estadisticas[0].ticket_promedio || 0).toFixed(2)}`);

    // Cerrar conexiones
    await pool.end();
    console.log('\nProceso completado exitosamente.');
    console.log('Ahora puede ejecutar el recálculo de patrones de compra.');

  } catch (error) {
    console.error('Error general:', error);
  }
}

// Ejecutar función principal
main().catch(console.error);