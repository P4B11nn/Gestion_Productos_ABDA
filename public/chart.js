/**
 * Módulo para generar gráficos de análisis de productos
 * Utiliza Chart.js para visualizar datos de ventas y precios
 */

class ProductoAnalytics {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.charts = {}; // Almacenará las instancias de los gráficos
    
    if (!this.container) {
      console.error(`No se encontró el contenedor con ID ${containerId}`);
      return;
    }
    
    // Crear estructura para los gráficos
    this.setupChartContainers();
  }
  
  // Crear contenedores para los diferentes gráficos
  setupChartContainers() {
    const preciosContainer = document.createElement('div');
    preciosContainer.className = 'chart-container';
    preciosContainer.innerHTML = `
      <h3>Histórico de Precios</h3>
      <div class="chart-wrapper">
        <canvas id="precio-chart"></canvas>
      </div>
    `;
    
    const ventasContainer = document.createElement('div');
    ventasContainer.className = 'chart-container';
    ventasContainer.innerHTML = `
      <h3>Volumen de Ventas</h3>
      <div class="chart-wrapper">
        <canvas id="ventas-chart"></canvas>
      </div>
    `;
    
    this.container.appendChild(preciosContainer);
    this.container.appendChild(ventasContainer);
  }
  
  // Cargar datos del producto y mostrar gráficos
  async loadProductoAnalytics(productoId) {
    try {
      this.container.classList.add('loading');
      
      // Obtener datos históricos del endpoint
      const response = await fetch(`/api/productos/${productoId}/analytics`);
      if (!response.ok) {
        throw new Error(`Error al cargar datos históricos: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Error en la respuesta del servidor');
      }
      
      // Destruir gráficos existentes si hay
      this.destroyCharts();
      
      // Mostrar los gráficos con los datos recibidos
      this.renderPreciosChart(data.historicoPrecio);
      this.renderVentasChart(data.historicoVentas);
      
      this.container.classList.remove('loading');
      this.container.classList.add('chart-visible');
      
    } catch (error) {
      console.error('Error al cargar datos de analytics:', error);
      this.container.innerHTML = `
        <div class="error-message">
          <p>No se pudieron cargar los datos históricos</p>
          <p class="error-details">${error.message}</p>
        </div>
      `;
      this.container.classList.remove('loading');
    }
  }
  
  // Renderizar gráfico de precios históricos
  renderPreciosChart(preciosData) {
    const ctx = document.getElementById('precio-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = preciosData.map(item => item.periodo);
    const precios = preciosData.map(item => item.precio);
    
    // Crear gráfico de líneas
    this.charts.precios = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Precio ($)',
          data: precios,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: 'rgb(75, 192, 192)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            title: {
              display: true,
              text: 'Precio ($)'
            },
            ticks: {
              callback: function(value) {
                return '$' + value;
              }
            }
          },
          x: {
            title: {
              display: true,
              text: 'Período'
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Precio: $${context.parsed.y}`;
              }
            }
          },
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Evolución del Precio'
          }
        }
      }
    });
  }
  
  // Renderizar gráfico de volumen de ventas
  renderVentasChart(ventasData) {
    const ctx = document.getElementById('ventas-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = ventasData.map(item => item.periodo);
    const unidades = ventasData.map(item => item.unidades);
    const ingresos = ventasData.map(item => item.ingresos);
    
    // Crear gráfico combinado (barras y línea)
    this.charts.ventas = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Unidades',
            data: unidades,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1,
            order: 2,
            yAxisID: 'y'
          },
          {
            label: 'Ingresos',
            data: ingresos,
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            borderColor: 'rgb(255, 159, 64)',
            borderWidth: 2,
            type: 'line',
            order: 1,
            yAxisID: 'y1',
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: 'rgb(255, 159, 64)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Unidades'
            },
            position: 'left',
            grid: {
              display: false
            }
          },
          y1: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Ingresos ($)'
            },
            position: 'right',
            grid: {
              display: false
            },
            ticks: {
              callback: function(value) {
                return '$' + value;
              }
            }
          },
          x: {
            title: {
              display: true,
              text: 'Período'
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const dataset = context.dataset.label;
                const value = context.parsed.y;
                
                if (dataset === 'Ingresos') {
                  return `${dataset}: $${value}`;
                } else {
                  return `${dataset}: ${value}`;
                }
              }
            }
          },
          title: {
            display: true,
            text: 'Ventas Históricas'
          }
        }
      }
    });
  }
  
  // Destruir gráficos existentes para liberar memoria
  destroyCharts() {
    Object.values(this.charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.charts = {};
  }
}

// Exportar la clase para uso en el script principal
window.ProductoAnalytics = ProductoAnalytics;