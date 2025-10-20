/**
 * Script para calcular patrones de compra
 * Ejecutar con: node actualizar-patrones.js
 */

const patronesCompra = require('./patrones-compra');

async function main() {
  console.log('Iniciando cálculo de patrones de compra...');
  
  try {
    const resultado = await patronesCompra.calcularPatrones();
    
    if (resultado.success) {
      console.log('✅ ' + resultado.message);
      if (resultado.details) {
        console.log(resultado.details);
      }
    } else {
      console.error('❌ Error: ' + resultado.message);
      console.error(resultado.error);
    }
  } catch (error) {
    console.error('❌ Error inesperado:', error);
  }
  
  process.exit(0);
}

main();
