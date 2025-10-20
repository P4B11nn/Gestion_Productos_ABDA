/**
 * Script para la interfaz de análisis de productos con patrones de compra
 */

let currentAnalyticsData = null;

document.addEventListener('DOMContentLoaded', () => {
  // Referencias a elementos del DOM
  const searchInput = document.getElementById('search-input');
  const btnSearch = document.getElementById('btn-search');
  const productosList = document.getElementById('productos-list');
  const productoDetalle = document.getElementById('producto-detalle');
  
  // Verificar que los elementos existen
  if (!searchInput || !btnSearch || !productosList || !productoDetalle) {
    console.error('No se encontraron todos los elementos del DOM necesarios');
    return;
  }
  
  // Inicializar eventos
  btnSearch.addEventListener('click', buscarProductos);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      buscarProductos();
    }
  });
  
  // Cargar productos iniciales
  cargarProductosIniciales();
  
  // Función para cargar productos iniciales
  async function cargarProductosIniciales() {
    try {
      productosList.innerHTML = '<p class="loading">Cargando productos...</p>';
      
      const response = await fetch('/api/productos');
      const data = await response.json();
      
      if (data.success && data.productos) {
        mostrarListaProductos(data.productos.slice(0, 50)); // Mostrar solo los primeros 50
        console.log('Búsqueda de productos: "Todos" - ' + Math.min(data.productos.length, 50) + ' resultados');
      } else {
        productosList.innerHTML = '<p class="error">Error al cargar productos</p>';
      }
    } catch (error) {
      console.error('Error al cargar productos:', error);
      productosList.innerHTML = '<p class="error">Error de conexión</p>';
    }
  }
  
  // Función para buscar productos
  async function buscarProductos() {
    const query = searchInput.value.trim();
    
    try {
      productosList.innerHTML = '<p class="loading">Buscando productos...</p>';
      
      let url = '/api/productos';
      if (query) {
        url += `?search=${encodeURIComponent(query)}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && data.productos) {
        mostrarListaProductos(data.productos.slice(0, 50));
        console.log(`Búsqueda de productos: "${query || 'Todos'}" - ${Math.min(data.productos.length, 50)} resultados`);
      } else {
        productosList.innerHTML = '<p class="error">No se encontraron productos</p>';
      }
    } catch (error) {
      console.error('Error en la búsqueda:', error);
      productosList.innerHTML = '<p class="error">Error de conexión</p>';
    }
  }
  
  // Función para mostrar la lista de productos
  function mostrarListaProductos(productos) {
    if (!productos || productos.length === 0) {
      productosList.innerHTML = '<p class="error">No se encontraron productos</p>';
      return;
    }
    
    productosList.innerHTML = productos.map(producto => `
      <div class="producto-item" onclick="seleccionarProducto(${producto.id}, '${producto.nombre.replace(/'/g, "\\'")}', ${producto.precio_actual}, ${producto.stock_actual})">
        <h3>${producto.nombre}</h3>
        <p class="descripcion">${producto.categoria || 'Sin categoría'}</p>
      </div>
    `).join('');
  }
  
  // Función para seleccionar un producto y cargar sus indicadores
  window.seleccionarProducto = async function(id, nombre, precio, stock) {
    console.log('Seleccionando producto con ID:', id);
    
    try {
      // Cargar indicadores del producto
      const indicadoresResponse = await fetch(`/api/productos/${id}/indicadores`);
      const indicadoresData = await indicadoresResponse.json();
      
      // Cargar datos de analytics del producto
      const analyticsResponse = await fetch(`/api/productos/${id}/analytics`);
      const analyticsData = await analyticsResponse.json();
      
      console.log('Indicadores recibidos:', indicadoresData);
      
      if (indicadoresData.success) {
        currentAnalyticsData = analyticsData.success ? analyticsData.data : null;
        renderizarDetalleProducto(id, nombre, precio, stock, indicadoresData.data);
        
        // Cargar gráficos si hay datos de analytics
        if (currentAnalyticsData) {
          setTimeout(() => {
            cargarDatosHistoricos(id, currentAnalyticsData);
          }, 100);
        }
      } else {
        mostrarError('Error al cargar indicadores del producto');
      }
    } catch (error) {
      console.error('Error al cargar producto:', error);
      mostrarError('Error de conexión al cargar el producto');
    }
  }
  
  // Función para renderizar el detalle del producto con indicadores
  function renderizarDetalleProducto(id, nombre, precio, stock, indicadores) {
    const { combo, bajo_stock, demanda, recomendaciones } = indicadores;
    
    let contenidoRecomendaciones = '';
    if (recomendaciones && recomendaciones.length > 0) {
      contenidoRecomendaciones = `
        <div class="indicador recomendaciones">
          <h3>🛒 Patrones de Compra</h3>
          <div class="recomendaciones-lista">
            ${recomendaciones.map(rec => `
              <div class="recomendacion-item">
                <div class="producto-recomendado">
                  <strong>${rec.producto_nombre}</strong>
                  <div class="metricas">
                    <span class="confianza">Confianza: ${(rec.confianza * 100).toFixed(1)}%</span>
                    <span class="lift">Lift: ${rec.lift.toFixed(2)}</span>
                  </div>
                </div>
                <div class="patron-detalle">
                  Quienes compran este producto también compran <strong>${rec.producto_nombre}</strong>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    productoDetalle.innerHTML = `
      <div class="producto-header">
        <h2>${nombre}</h2>
        <div class="producto-info">
          <p class="producto-id">ID: ${id}</p>
          <p class="precio">Precio: $${parseFloat(precio).toFixed(2)}</p>
          <p class="stock">Stock: ${stock} unidades</p>
        </div>
      </div>
      
      <div class="indicadores-container">
        ${contenidoRecomendaciones}
        
        <div class="indicador ${combo ? 'positivo' : 'neutro'}">
          <h3>🔗 Producto Combo</h3>
          <p class="valor">${combo || 'No identificado como combo'}</p>
          <p class="descripcion">
            ${combo ? 'Este producto forma parte de combinaciones frecuentes' : 'No se han detectado patrones de combo para este producto'}
          </p>
        </div>
        
        <div class="indicador ${bajo_stock ? 'negativo' : 'positivo'}">
          <h3>📦 Estado de Stock</h3>
          <p class="valor">${bajo_stock ? 'Stock Bajo' : 'Stock Normal'}</p>
          <p class="descripcion">
            ${bajo_stock ? 'Considere reabastecer este producto pronto' : 'El nivel de stock es adecuado'}
          </p>
        </div>
        
        <div class="indicador ${getDemandaClass(demanda)}">
          <h3>📈 Nivel de Demanda</h3>
          <p class="valor">${demanda || 'No calculado'}</p>
          <p class="descripcion">
            ${getDemandaDescription(demanda)}
          </p>
        </div>
        
        ${!recomendaciones || recomendaciones.length === 0 ? `
          <div class="indicador neutro">
            <h3>ℹ️ Patrones de Compra</h3>
            <p class="valor">No disponibles</p>
            <p class="descripcion">No se encontraron patrones de compra para este producto</p>
          </div>
        ` : ''}
      </div>
      
      <div id="analytics-container" class="analytics-container">
        <h3>Análisis de Datos Históricos</h3>
        <p class="loading-text">Cargando datos históricos...</p>
      </div>
    `;
  }
  
  // Funciones auxiliares para clasificar demanda
  function getDemandaClass(demanda) {
    if (!demanda) return 'neutro';
    if (demanda === 'Alta') return 'positivo';
    if (demanda === 'Media') return 'neutro';
    if (demanda === 'Baja') return 'negativo';
    return 'neutro';
  }
  
  function getDemandaDescription(demanda) {
    if (!demanda) return 'Información de demanda no disponible';
    switch (demanda) {
      case 'Alta': return 'Este producto tiene alta demanda y rotación';
      case 'Media': return 'Este producto mantiene una demanda estable';
      case 'Baja': return 'Este producto tiene baja demanda actualmente';
      default: return 'Nivel de demanda no determinado';
    }
  }
  
  // Función para mostrar errores
  function mostrarError(mensaje) {
    productoDetalle.innerHTML = `
      <div class="error-container">
        <h2>Error</h2>
        <p>${mensaje}</p>
      </div>
    `;
  }
});

// Función global para obtener datos de analytics actuales
window.getCurrentAnalyticsData = function() {
  return currentAnalyticsData;
};