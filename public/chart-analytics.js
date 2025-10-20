/**
 * chart-analytics.js
 * Funciones para crear y manejar gráficos en el dashboard de análisis
 */

// Colores para los gráficos
const CHART_COLORS = {
    primary: '#3498db',
    secondary: '#2c3e50',
    accent: '#e74c3c',
    success: '#27ae60',
    warning: '#f39c12',
    info: '#17a2b8',
    light: '#f8f9fa',
    dark: '#343a40'
};

const CATEGORY_COLORS = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#e67e22', '#1abc9c', '#34495e', '#95a5a6', '#d35400'
];

// Objeto para almacenar instancias de gráficos
const charts = {};

// === GRÁFICOS DE VISTA GENERAL ===

// Crear gráfico de tendencias de ventas
function createTendenciasChart(data) {
    const ctx = document.getElementById('ventas-tendencia-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.periodo);
    const ventasData = data.map(item => item.total_vendido);
    const ingresosData = data.map(item => parseFloat(item.ingresos_totales));
    
    // Destruir gráfico anterior si existe
    if (charts.tendencias) {
        charts.tendencias.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendencias = new Chart(context, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Unidades Vendidas',
                    data: ventasData,
                    borderColor: CHART_COLORS.primary,
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Ingresos ($)',
                    data: ingresosData,
                    borderColor: CHART_COLORS.accent,
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Periodo'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Unidades Vendidas'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Ingresos ($)'
                    }
                }
            }
        }
    });
}

// Crear gráfico de ventas por categorías para la vista general
function createVentasCategoriasChart(data) {
    const ctx = document.getElementById('ventas-categoria-chart');
    
    if (!ctx) {
        console.error('Element ventas-categoria-chart not found');
        return;
    }
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.categoria);
    const ventasData = data.map(item => item.total_vendido);
    const backgroundColors = data.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length]);
    
    // Destruir gráfico anterior si existe
    if (charts.ventasCategorias) {
        charts.ventasCategorias.destroy();
    }
    
    // Crear nuevo gráfico
    charts.ventasCategorias = new Chart(context, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [
                {
                    data: ventasData,
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.label}: ${formatNumber(context.raw)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// === GRÁFICOS DE ANÁLISIS POR PRODUCTO ===

// Crear gráfico de ventas de producto
function createProductoVentasChart(ventasPorMes) {
    const ctx = document.getElementById('producto-ventas-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = ventasPorMes.map(item => item.mes);
    const ventasData = ventasPorMes.map(item => item.total_vendido);
    const ingresosData = ventasPorMes.map(item => parseFloat(item.ingresos_totales));
    
    // Destruir gráfico anterior si existe
    if (charts.productoVentas) {
        charts.productoVentas.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoVentas = new Chart(context, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Unidades Vendidas',
                    data: ventasData,
                    backgroundColor: CHART_COLORS.primary,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Ingresos ($)',
                    data: ingresosData,
                    borderColor: CHART_COLORS.accent,
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.datasetIndex === 0) {
                                label += formatNumber(context.raw);
                            } else {
                                label += '$' + formatNumber(context.raw);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Periodo'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Unidades Vendidas'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Ingresos ($)'
                    }
                }
            }
        }
    });
}

// Crear gráfico de ventas de producto desde datos de analytics
function createProductoVentasChartFromAnalytics(historicoVentas) {
    const ctx = document.getElementById('producto-ventas-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = historicoVentas.map(item => item.periodo);
    const ventasData = historicoVentas.map(item => item.unidades);
    const ingresosData = historicoVentas.map(item => item.ingresos);
    
    // Destruir gráfico anterior si existe
    if (charts.productoVentas) {
        charts.productoVentas.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoVentas = new Chart(context, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Unidades Vendidas',
                    data: ventasData,
                    backgroundColor: CHART_COLORS.primary,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Ingresos ($)',
                    data: ingresosData,
                    borderColor: CHART_COLORS.accent,
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.datasetIndex === 0) {
                                label += formatNumber(context.raw);
                            } else {
                                label += '$' + formatNumber(context.raw);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Periodo'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Unidades Vendidas'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Ingresos ($)'
                    }
                }
            }
        }
    });
}

// Crear gráfico de evolución de precios
function createProductoPrecioChart(historicoPrecio) {
    const ctx = document.getElementById('producto-precio-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = historicoPrecio.map(item => item.periodo);
    const preciosData = historicoPrecio.map(item => item.precio);
    
    // Destruir gráfico anterior si existe
    if (charts.productoPrecio) {
        charts.productoPrecio.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoPrecio = new Chart(context, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Precio ($)',
                    data: preciosData,
                    borderColor: CHART_COLORS.success,
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: CHART_COLORS.success,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Precio: $${formatNumber(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Periodo'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Precio ($)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + formatNumber(value);
                        }
                    }
                }
            }
        }
    });
}

// Crear gráfico de pronóstico
function createProductoPronosticoChart(pronosticoData) {
    const ctx = document.getElementById('producto-pronostico-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const datosHistoricos = pronosticoData.datosHistoricos || [];
    const pronostico = pronosticoData.pronostico || [];
    
    const labels = [
        ...datosHistoricos.map(item => item.periodo),
        ...pronostico.map(item => item.periodo)
    ];
    
    const ventasHistoricas = datosHistoricos.map(item => item.cantidad_vendida);
    const ventasPronostico = Array(datosHistoricos.length).fill(null).concat(pronostico.map(item => item.cantidad_estimada));
    
    // Destruir gráfico anterior si existe
    if (charts.productoPronostico) {
        charts.productoPronostico.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoPronostico = new Chart(context, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ventas Históricas',
                    data: ventasHistoricas,
                    borderColor: CHART_COLORS.primary,
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Pronóstico',
                    data: ventasPronostico,
                    borderColor: CHART_COLORS.warning,
                    backgroundColor: 'rgba(241, 196, 15, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                label += formatNumber(context.raw) + ' unidades';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Unidades'
                    }
                }
            }
        }
    });
}

// === GRÁFICOS DE ANÁLISIS POR CATEGORÍA ===

// Crear gráfico de categorías (para sección de categorías)
function createCategoriasChart(data) {
    const ctx = document.getElementById('categoria-ventas-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.categoria);
    const ventasData = data.map(item => item.total_vendido);
    const backgroundColors = data.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length]);
    
    // Destruir gráfico anterior si existe
    if (charts.categorias) {
        charts.categorias.destroy();
    }
    
    // Crear nuevo gráfico
    charts.categorias = new Chart(context, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [
                {
                    data: ventasData,
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.label}: ${formatNumber(context.raw)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Crear gráfico de distribución de productos por categoría
function createCategoriaDistribucionChart(data) {
    const ctx = document.getElementById('categoria-distribucion-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.categoria);
    const productosData = data.map(item => item.cantidad_productos || 0);
    const backgroundColors = data.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length]);
    
    // Destruir gráfico anterior si existe
    if (charts.categoriaDistribucion) {
        charts.categoriaDistribucion.destroy();
    }
    
    // Crear nuevo gráfico
    charts.categoriaDistribucion = new Chart(context, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '# Productos',
                    data: productosData,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors,
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw} productos`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Número de Productos'
                    }
                }
            }
        }
    });
}

// === GRÁFICOS DE TENDENCIAS ===

// Crear gráfico de tendencias completas
function createTendenciasFullCharts(data) {
    createTendenciasVentasChart(data);
    createTendenciasIngresosChart(data);
    createTendenciasCategoriaChart(data);
}

// Crear gráfico de evolución de ventas (tendencias)
function createTendenciasVentasChart(data) {
    const ctx = document.getElementById('tendencias-ventas-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.periodo);
    const ventasData = data.map(item => item.total_vendido);
    const transaccionesData = data.map(item => item.numero_transacciones);
    
    // Destruir gráfico anterior si existe
    if (charts.tendenciasVentas) {
        charts.tendenciasVentas.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendenciasVentas = new Chart(context, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Unidades Vendidas',
                    data: ventasData,
                    borderColor: CHART_COLORS.primary,
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Número de Transacciones',
                    data: transaccionesData,
                    borderColor: CHART_COLORS.success,
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Periodo'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Unidades Vendidas'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Transacciones'
                    }
                }
            }
        }
    });
}

// Crear gráfico de ingresos vs unidades vendidas
function createTendenciasIngresosChart(data) {
    const ctx = document.getElementById('tendencias-ingresos-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.periodo);
    const ventasData = data.map(item => item.total_vendido);
    const ingresosData = data.map(item => parseFloat(item.ingresos_totales));
    
    // Destruir gráfico anterior si existe
    if (charts.tendenciasIngresos) {
        charts.tendenciasIngresos.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendenciasIngresos = new Chart(context, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Unidades Vendidas',
                    data: ventasData,
                    backgroundColor: CHART_COLORS.primary,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Ingresos ($)',
                    data: ingresosData,
                    borderColor: CHART_COLORS.accent,
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Unidades Vendidas'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Ingresos ($)'
                    }
                }
            }
        }
    });
}

// Crear gráfico de evolución por categoría
function createTendenciasCategoriaChart(data) {
    const ctx = document.getElementById('tendencias-categoria-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Para este gráfico necesitaríamos datos agregados por categoría
    // Por ahora, crear un gráfico básico con los datos disponibles
    const labels = data.map(item => item.periodo);
    const ingresosData = data.map(item => parseFloat(item.ingresos_totales));
    
    // Destruir gráfico anterior si existe
    if (charts.tendenciasCategoria) {
        charts.tendenciasCategoria.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendenciasCategoria = new Chart(context, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ingresos Totales',
                    data: ingresosData,
                    borderColor: CHART_COLORS.accent,
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Ingresos: $${formatNumber(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Ingresos ($)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + formatNumber(value);
                        }
                    }
                }
            }
        }
    });
}

// === FUNCIONES AUXILIARES ===

// Formatear números
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}