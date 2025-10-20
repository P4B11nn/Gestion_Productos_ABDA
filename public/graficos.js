/**
 * Módulo para visualización de datos históricos usando Chart.js
 * Este archivo complementa al script.js principal añadiendo gráficos
 */

document.addEventListener('DOMContentLoaded', () => {
  // Verificar que Chart.js esté disponible
  if (typeof Chart === 'undefined') {
    console.error('Chart.js no está disponible. Asegúrate de incluirlo antes de este script.');
    return;
  } else {
    console.log('Chart.js está disponible, versión:', Chart.version);
  }

  // Colores para los gráficos
  const chartColors = {
    ventas: {
      primary: 'rgba(54, 162, 235, 0.7)',
      secondary: 'rgba(54, 162, 235, 0.2)'
    },
    precios: {
      primary: 'rgba(75, 192, 192, 0.7)',
      secondary: 'rgba(75, 192, 192, 0.2)',
      min: 'rgba(255, 99, 132, 0.5)',
      max: 'rgba(153, 102, 255, 0.5)'
    }
  };

  // Referencias a los elementos del DOM para gráficos
  let chartVentas = null;
  let chartPrecios = null;

  // Función para cargar los datos históricos del producto
  window.cargarDatosHistoricos = async function(productoId, dataAnalyticsPreCargados = null) {
    console.log('cargarDatosHistoricos llamado con ID:', productoId);
    if (!productoId) return;

    // Mostrar indicador de carga
    const analyticsContainer = document.getElementById('analytics-container');
    if (!analyticsContainer) {
      console.error('No se encontró el contenedor analytics-container');
      return;
    }

    analyticsContainer.classList.add('loading');
    
    try {
      // Usar datos precargados si se proporcionan, o solicitarlos al servidor
      let data;
      
      if (dataAnalyticsPreCargados) {
        console.log('Usando datos de analytics pre-cargados');
        // Si es un objeto response con success, extraer la data
        if (dataAnalyticsPreCargados.success !== undefined) {
          data = dataAnalyticsPreCargados;
        } else {
          // Si ya es la data directa
          data = dataAnalyticsPreCargados;
        }
      } else {
        // Solicitar datos históricos al servidor
        console.log('Solicitando datos de analytics al servidor');
        const response = await fetch(`/api/productos/${productoId}/analytics`);
        
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const responseData = await response.json();
        
        if (!responseData.success) {
          throw new Error(responseData.error || 'Error en la respuesta del servidor');
        }
        
        data = responseData;
      }
      
      // Verificar que la data tenga la estructura correcta
      let historicoPrecio = [];
      let historicoVentas = [];
      
      console.log('Estructura de data recibida:', data);
      
      if (data.historicoPrecio && data.historicoVentas) {
        historicoPrecio = data.historicoPrecio;
        historicoVentas = data.historicoVentas;
        console.log('Usando estructura directa - historicoPrecio:', historicoPrecio.length, 'historicoVentas:', historicoVentas.length);
      } else if (data.data && data.data.historicoPrecio && data.data.historicoVentas) {
        historicoPrecio = data.data.historicoPrecio;
        historicoVentas = data.data.historicoVentas;
        console.log('Usando estructura anidada - historicoPrecio:', historicoPrecio.length, 'historicoVentas:', historicoVentas.length);
      } else {
        console.error('Estructura de datos no reconocida:', data);
      }
      
      // Verificar que haya datos
      if (historicoPrecio.length === 0 && historicoVentas.length === 0) {
        analyticsContainer.innerHTML = `
          <h3>Análisis de Datos Históricos</h3>
          <div class="error-message">
            No hay datos históricos disponibles para este producto.
          </div>
        `;
        return;
      }
      
      // Preparar contenedores para los gráficos si no existen
      if (!document.getElementById('chart-ventas') || !document.getElementById('chart-precios')) {
        analyticsContainer.innerHTML = `
          <h3>Análisis de Datos Históricos</h3>
          <div class="chart-container">
            <h4>Historial de Ventas</h4>
            <canvas id="chart-ventas"></canvas>
          </div>
          
          <div class="chart-container">
            <h4>Evolución de Precios</h4>
            <canvas id="chart-precios"></canvas>
          </div>
        `;
      }
      
      // Transformar datos al formato esperado por las funciones de gráficos
      const ventasPorPeriodo = historicoVentas.map(item => ({
        periodo: item.periodo,
        unidades_vendidas: item.unidades,
        total_ventas: item.ingresos
      }));
      
      const preciosPorPeriodo = historicoPrecio.map(item => ({
        periodo: item.periodo,
        precio_promedio: item.precio,
        precio_minimo: item.precio * 0.95, // Simular mínimo
        precio_maximo: item.precio * 1.05  // Simular máximo
      }));
      
      // Generar gráficos con los datos transformados
      if (ventasPorPeriodo.length > 0) {
        generarGraficoVentas(ventasPorPeriodo);
      }
      
      if (preciosPorPeriodo.length > 0) {
        generarGraficoPrecios(preciosPorPeriodo);
      }
      
    } catch (error) {
      console.error('Error al cargar datos históricos:', error);
      analyticsContainer.innerHTML = `
        <h3>Análisis de Datos Históricos</h3>
        <div class="error-message">
          Error al cargar los datos históricos.
          <div class="error-details">${error.message}</div>
        </div>
      `;
    } finally {
      analyticsContainer.classList.remove('loading');
    }
  };

  // Función para generar el gráfico de ventas
  function generarGraficoVentas(datosVentas) {
    const canvas = document.getElementById('chart-ventas');
    if (!canvas) return;
    
    // Preparar datos para el gráfico
    const labels = datosVentas.map(dato => dato.periodo);
    const unidadesVendidas = datosVentas.map(dato => dato.unidades_vendidas);
    const totalVentas = datosVentas.map(dato => dato.total_ventas);
    
    // Si ya existe un gráfico, destruirlo
    if (chartVentas) {
      chartVentas.destroy();
    }
    
    // Crear nuevo gráfico
    chartVentas = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Unidades Vendidas',
            data: unidadesVendidas,
            backgroundColor: chartColors.ventas.primary,
            borderColor: chartColors.ventas.primary,
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Total en Ventas ($)',
            data: totalVentas,
            backgroundColor: 'rgba(255, 159, 64, 0.7)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1,
            type: 'line',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            title: {
              display: true,
              text: 'Unidades'
            }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: {
              drawOnChartArea: false,
            },
            title: {
              display: true,
              text: 'Ventas ($)'
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  if (context.dataset.yAxisID === 'y1') {
                    label += '$' + context.parsed.y.toFixed(2);
                  } else {
                    label += context.parsed.y;
                  }
                }
                return label;
              }
            }
          },
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Historial de Ventas por Período'
          }
        }
      }
    });
  }

  // Función para generar el gráfico de precios
  function generarGraficoPrecios(datosPrecios) {
    const canvas = document.getElementById('chart-precios');
    if (!canvas) return;
    
    // Preparar datos para el gráfico
    const labels = datosPrecios.map(dato => dato.periodo);
    const preciosPromedio = datosPrecios.map(dato => dato.precio_promedio);
    const preciosMinimo = datosPrecios.map(dato => dato.precio_minimo);
    const preciosMaximo = datosPrecios.map(dato => dato.precio_maximo);
    
    // Si ya existe un gráfico, destruirlo
    if (chartPrecios) {
      chartPrecios.destroy();
    }
    
    // Crear nuevo gráfico
    chartPrecios = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Precio Promedio',
            data: preciosPromedio,
            backgroundColor: chartColors.precios.secondary,
            borderColor: chartColors.precios.primary,
            borderWidth: 2,
            fill: false,
            tension: 0.3
          },
          {
            label: 'Precio Mínimo',
            data: preciosMinimo,
            backgroundColor: 'rgba(0,0,0,0)',
            borderColor: chartColors.precios.min,
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Precio Máximo',
            data: preciosMaximo,
            backgroundColor: 'rgba(0,0,0,0)',
            borderColor: chartColors.precios.max,
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
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
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += '$' + context.parsed.y.toFixed(2);
                }
                return label;
              }
            }
          },
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Evolución de Precios por Período'
          }
        }
      }
    });
  }
});