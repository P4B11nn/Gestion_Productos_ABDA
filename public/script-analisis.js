/**
 * Script de análisis de datos de ventas
 * Proporciona visualización interactiva para analizar productos, ventas y tendencias
 */

// Configuración
const API_URL = '/api';

// Objetos para almacenar datos
const storeData = {
    productos: [],
    categorias: [],
    tendencias: [],
    productoActual: null
};

// Inicialización cuando el DOM está cargado
document.addEventListener('DOMContentLoaded', function() {
    // Manejar navegación entre secciones
    setupNavigation();
    
    // Cargar datos iniciales y establecer gráficos
    loadInitialData();
    
    // Configurar manejadores de eventos
    setupEventHandlers();
    
    // Procesar parámetros de URL si existen
    procesarParametrosURL();
});

// Configurar navegación entre secciones
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Quitar clase activa de todos los enlaces
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Agregar clase activa al enlace actual
            this.classList.add('active');
            
            // Mostrar sección correspondiente
            const sectionId = this.getAttribute('data-section');
            document.querySelectorAll('.section').forEach(section => {
                section.classList.add('d-none');
                section.classList.remove('active');
            });
            
            const targetSection = document.getElementById(sectionId);
            targetSection.classList.remove('d-none');
            targetSection.classList.add('active');
            
            // Cargar datos específicos según la sección
            if (sectionId === 'categorias' && !charts.categorias) {
                loadCategoriaData();
                // Cargar productos por categoría (todos inicialmente)
                loadProductosPorCategoria('');
            } else if (sectionId === 'tendencias' && !charts.tendenciasVentas) {
                loadTendenciasData();
            } else if (sectionId === 'reportes') {
                initReportesSection();
            }
        });
    });
}

// Cargar datos iniciales
async function loadInitialData() {
    try {
        // Verificar conexión a la base de datos
        const statusResponse = await fetch(`${API_URL}/status`);
        const statusData = await statusResponse.json();
        console.log('Estado de conexión:', statusData);
        
        // Cargar productos más vendidos
        await loadTopProductos();
        
        // Cargar datos de tendencias generales
        await loadTendenciasGenerales();
        
        // Cargar datos de categorías para el gráfico principal
        await loadCategoriaData();
        
        // Crear gráfico de categorías para vista general
        await loadCategoriasVentasGeneral();
        
        // Inicializar lista desplegable de productos
        await initProductosList();
        
    } catch (error) {
        console.error('Error al cargar datos iniciales:', error);
        showError('No se pudieron cargar los datos iniciales. Verifique la conexión al servidor.');
    }
}

// Cargar top productos
async function loadTopProductos() {
    try {
        const response = await fetch(`${API_URL}/productos/mas-vendidos`);
        const data = await response.json();
        
        storeData.productos = data;
        
        // Actualizar tabla de productos más vendidos
        updateTopProductosTable(data);
        
        // Actualizar datos de resumen
        updateSummaryData(data);
        
    } catch (error) {
        console.error('Error al cargar productos más vendidos:', error);
    }
}

// Actualizar tabla de productos más vendidos
function updateTopProductosTable(productos) {
    const tableBody = document.querySelector('#top-productos-table tbody');
    
    if (productos.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay datos disponibles</td></tr>';
        return;
    }
    
    let html = '';
    productos.forEach((producto, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${producto.nombre}</td>
                <td>${producto.total_vendido}</td>
                <td>$${formatNumber(producto.ingresos_totales)}</td>
                <td>$${formatNumber(producto.precio_promedio)}</td>
                <td>
                    <button class="btn btn-sm btn-primary ver-producto" data-id="${producto.producto_id}">
                        <i class="fas fa-chart-line"></i> Ver análisis
                    </button>
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    
    // Agregar eventos a los botones de ver producto
    document.querySelectorAll('.ver-producto').forEach(btn => {
        btn.addEventListener('click', function() {
            const productoId = this.getAttribute('data-id');
            showProductoAnalisis(productoId);
            
            // Cambiar a la sección de productos
            document.querySelector('.nav-link[data-section="productos"]').click();
        });
    });
}

// Actualizar datos de resumen
function updateSummaryData(productos) {
    // Usar el endpoint de estadísticas generales para datos precisos
    fetch('/api/estadisticas/generales')
        .then(response => response.json())
        .then(estadisticas => {
            if (estadisticas.success) {
                document.getElementById('total-productos').textContent = 
                    formatNumber(estadisticas.data.totalProductos);
                document.getElementById('total-ventas').textContent = 
                    formatNumber(estadisticas.data.totalVentas);
                document.getElementById('ingresos-totales').textContent = 
                    '$' + formatNumber(parseFloat(estadisticas.data.totalIngresos));
                document.getElementById('tendencia-ventas').innerHTML = 
                    `<small>${estadisticas.data.tendenciaMensual}</small>`;
            } else {
                console.error('Error al obtener estadísticas:', estadisticas.error);
                // Fallback a cálculos locales
                updateSummaryDataLocal(productos);
            }
        })
        .catch(error => {
            console.error('Error al cargar estadísticas:', error);
            // Fallback a cálculos locales si falla el endpoint
            updateSummaryDataLocal(productos);
        });
}

// Función de respaldo para cálculos locales
function updateSummaryDataLocal(productos) {
    // Calcular totales basados en productos limitados
    let totalVentas = 0;
    let totalIngresos = 0;
    
    productos.forEach(p => {
        totalVentas += p.total_vendido;
        totalIngresos += parseFloat(p.ingresos_totales);
    });
    
    // Actualizar elementos en la interfaz
    document.getElementById('total-ventas').textContent = formatNumber(totalVentas);
    document.getElementById('ingresos-totales').textContent = '$' + formatNumber(totalIngresos);
    document.getElementById('total-productos').textContent = productos.length + ' (top productos)';
    
    // Por defecto, mostrar tendencia como "Calculando..."
    document.getElementById('tendencia-ventas').innerHTML = '<small>Calculando...</small>';
}

// Cargar datos de tendencias generales
async function loadTendenciasGenerales() {
    try {
        const response = await fetch(`${API_URL}/ventas/tendencias`);
        const data = await response.json();
        
        storeData.tendencias = data;
        
        // Calcular tendencia
        if (data.length >= 2) {
            const lastMonth = data[data.length - 1];
            const previousMonth = data[data.length - 2];
            
            const change = lastMonth.total_vendido - previousMonth.total_vendido;
            const percentChange = (change / previousMonth.total_vendido) * 100;
            
            const tendenciaElement = document.getElementById('tendencia-ventas');
            
            if (percentChange > 0) {
                tendenciaElement.innerHTML = `+${percentChange.toFixed(1)}% <i class="fas fa-arrow-up text-success"></i>`;
            } else if (percentChange < 0) {
                tendenciaElement.innerHTML = `${percentChange.toFixed(1)}% <i class="fas fa-arrow-down text-danger"></i>`;
            } else {
                tendenciaElement.innerHTML = `0% <i class="fas fa-equals text-warning"></i>`;
            }
        }
        
        // Crear gráfico de tendencias
        createTendenciasChart(data);
        
    } catch (error) {
        console.error('Error al cargar tendencias generales:', error);
    }
}

// Crear gráfico de tendencias
function createTendenciasChart(data) {
    const ctx = document.getElementById('ventas-tendencia-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.periodo);
    const ventasData = data.map(item => item.total_vendido);
    const ingresosData = data.map(item => parseFloat(item.ingresos_totales));
    
    // Destruir gráfico anterior si existe
    if (charts.tendencias) {
        charts.tendencias.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendencias = new Chart(ctx, {
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
                    fill: true,
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

// Cargar datos de categorías
async function loadCategoriaData() {
    try {
        const response = await fetch(`${API_URL}/ventas/por-categoria`);
        const data = await response.json();
        
        storeData.categorias = data;
        
        // Crear gráfico de categorías
        createCategoriasChart(data);
        
        // Crear gráfico de distribución de productos
        createCategoriaDistribucionChart(data);
        
        // Llenar tabla de categorías
        fillCategoriasTable(data);
        
        // Llenar select de categorías
        const categoriaSelect = document.getElementById('categoria-select');
        let optionsHtml = '<option value="">Todas las categorías</option>';
        
        data.forEach(categoria => {
            optionsHtml += `<option value="${categoria.categoria}">${categoria.categoria}</option>`;
        });
        
        categoriaSelect.innerHTML = optionsHtml;
        
    } catch (error) {
        console.error('Error al cargar datos de categorías:', error);
    }
}

// Cargar datos de categorías para la vista general
async function loadCategoriasVentasGeneral() {
    try {
        const response = await fetch(`${API_URL}/ventas/por-categoria`);
        const data = await response.json();
        
        // Crear gráfico para la vista general
        createVentasCategoriasChart(data);
        
    } catch (error) {
        console.error('Error al cargar datos de categorías para vista general:', error);
    }
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

// Crear gráfico de categorías
function createCategoriasChart(data) {
    const ctx = document.getElementById('categoria-ventas-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = data.map(item => item.categoria);
    const ventasData = data.map(item => item.total_vendido);
    const backgroundColors = data.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length]);
    
    // Destruir gráfico anterior si existe
    if (charts.categorias) {
        charts.categorias.destroy();
    }
    
    // Crear nuevo gráfico
    charts.categorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [
                {
                    data: ventasData,
                    backgroundColor: backgroundColors,
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += formatNumber(context.raw) + ' unidades';
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// Llenar tabla de categorías
function fillCategoriasTable(data) {
    const tabla = document.getElementById('categoria-tabla').getElementsByTagName('tbody')[0];
    
    if (!tabla) return;
    
    // Limpiar tabla existente
    tabla.innerHTML = '';
    
    if (data.length === 0) {
        tabla.innerHTML = '<tr><td colspan="5" class="text-center">No hay datos disponibles</td></tr>';
        return;
    }
    
    // Llenar tabla con datos
    data.forEach(categoria => {
        const fila = tabla.insertRow();
        fila.innerHTML = `
            <td><strong>${categoria.categoria}</strong></td>
            <td>${formatNumber(categoria.total_vendido)}</td>
            <td>$${formatNumber(categoria.ingresos_totales)}</td>
            <td>${categoria.cantidad_productos || 0}</td>
            <td>${categoria.numero_transacciones || 0}</td>
        `;
    });
}

// Inicializar lista de productos
async function initProductosList() {
    const productoSelect = document.getElementById('producto-select');
    
    if (storeData.productos.length > 0) {
        let optionsHtml = '<option value="">Seleccione un producto...</option>';
        
        storeData.productos.forEach(producto => {
            optionsHtml += `<option value="${producto.producto_id}">${producto.nombre}</option>`;
        });
        
        productoSelect.innerHTML = optionsHtml;
    } else {
        try {
            // Cargar todos los productos si no se tienen los más vendidos
            const response = await fetch(`${API_URL}/productos/mas-vendidos`);
            const data = await response.json();
            
            let optionsHtml = '<option value="">Seleccione un producto...</option>';
            
            data.forEach(producto => {
                optionsHtml += `<option value="${producto.producto_id}">${producto.nombre}</option>`;
            });
            
            productoSelect.innerHTML = optionsHtml;
            
        } catch (error) {
            console.error('Error al cargar lista de productos:', error);
            productoSelect.innerHTML = '<option value="">Error al cargar productos</option>';
        }
    }
}

// Configurar manejadores de eventos
function setupEventHandlers() {
    // Manejar cambio en select de producto
    document.getElementById('producto-select').addEventListener('change', function() {
        const productoId = this.value;
        if (productoId) {
            showProductoAnalisis(productoId);
        } else {
            hideProductoAnalisis();
        }
    });
    
    // Manejar búsqueda de producto
    document.getElementById('btn-buscar-producto').addEventListener('click', function() {
        const busqueda = document.getElementById('producto-busqueda').value.trim().toLowerCase();
        if (busqueda) {
            buscarProducto(busqueda);
        }
    });
    
    document.getElementById('producto-busqueda').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const busqueda = this.value.trim().toLowerCase();
            if (busqueda) {
                buscarProducto(busqueda);
            }
        }
    });
    
    // Manejar cambio en select de categoría
    document.getElementById('categoria-select').addEventListener('change', function() {
        const categoria = this.value;
        filterProductosByCategoria(categoria);
    });
    
    // Manejar cambio de vista en categorías
    document.getElementById('btn-vista-tabla').addEventListener('click', function() {
        document.getElementById('btn-vista-grafica').classList.remove('active');
        this.classList.add('active');
        document.getElementById('categoria-grafica-container').classList.add('d-none');
        document.getElementById('categoria-tabla-container').classList.remove('d-none');
    });
    
    document.getElementById('btn-vista-grafica').addEventListener('click', function() {
        document.getElementById('btn-vista-tabla').classList.remove('active');
        this.classList.add('active');
        document.getElementById('categoria-tabla-container').classList.add('d-none');
        document.getElementById('categoria-grafica-container').classList.remove('d-none');
    });
    
    // Manejar cambio de periodo en tendencias
    document.getElementById('tendencias-periodo').addEventListener('change', function() {
        updateTendenciasChart();
    });
    
    // Manejar cambio de fechas en tendencias
    document.getElementById('tendencias-desde').addEventListener('change', updateTendenciasChart);
    document.getElementById('tendencias-hasta').addEventListener('change', updateTendenciasChart);
    
    // Cerrar panel de búsqueda cuando se navega a otra sección
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', function() {
            ocultarPanelResultados();
        });
    });
}

// Mostrar análisis de un producto específico
async function showProductoAnalisis(productoId) {
    try {
        // Mostrar mensaje de carga
        document.getElementById('producto-seleccion-mensaje').classList.add('d-none');
        document.getElementById('producto-detalle').classList.add('d-none');
        
        const loadingElement = document.createElement('div');
        loadingElement.className = 'loading';
        loadingElement.id = 'producto-loading';
        document.getElementById('productos').appendChild(loadingElement);
        
        // Cargar detalles del producto, pronóstico y analytics en paralelo
        const [detallesResponse, pronosticoResponse, analyticsResponse] = await Promise.all([
            fetch(`${API_URL}/productos/${productoId}/detalles`),
            fetch(`${API_URL}/productos/${productoId}/pronostico`),
            fetch(`${API_URL}/productos/${productoId}/analytics`)
        ]);
        
        const detallesData = await detallesResponse.json();
        const pronosticoData = await pronosticoResponse.json();
        const analyticsData = await analyticsResponse.json();
        
        // Guardar producto actual
        storeData.productoActual = {
            ...detallesData,
            pronostico: pronosticoData,
            analytics: analyticsData
        };
        
        // Actualizar interfaz con los datos del producto
        updateProductoUI(detallesData, pronosticoData, analyticsData);
        
        // Ocultar mensaje de carga
        document.getElementById('producto-loading').remove();
        document.getElementById('producto-detalle').classList.remove('d-none');
        
    } catch (error) {
        console.error('Error al cargar análisis de producto:', error);
        
        // Ocultar mensaje de carga
        if (document.getElementById('producto-loading')) {
            document.getElementById('producto-loading').remove();
        }
        
        // Mostrar mensaje de error
        const errorElement = document.createElement('div');
        errorElement.className = 'alert alert-danger mt-4';
        errorElement.textContent = 'Error al cargar los datos del producto. Intente nuevamente.';
        document.getElementById('productos').appendChild(errorElement);
        
        // Eliminar mensaje de error después de 5 segundos
        setTimeout(() => {
            errorElement.remove();
            document.getElementById('producto-seleccion-mensaje').classList.remove('d-none');
        }, 5000);
    }
}

// Actualizar interfaz con datos del producto
function updateProductoUI(data, pronosticoData, analyticsData) {
    const { informacion, historialVentas, ventasPorMes } = data;
    
    // Información general
    document.getElementById('producto-nombre').textContent = informacion.nombre;
    document.getElementById('producto-descripcion').textContent = informacion.descripcion || 'Sin descripción';
    document.getElementById('producto-precio').textContent = '$' + formatNumber(informacion.precio_actual);
    document.getElementById('producto-stock').textContent = informacion.stock_actual;
    document.getElementById('producto-reorden').textContent = informacion.punto_reorden || 'No definido';
    document.getElementById('producto-categoria').textContent = informacion.estado || 'Sin categoría';
    
    // Calcular métricas desde analytics API o fallback a datos locales
    let totalVendido = 0;
    let totalIngresos = 0;
    
    if (analyticsData.success && analyticsData.historicoVentas) {
        // Usar datos del analytics API
        analyticsData.historicoVentas.forEach(venta => {
            totalVendido += venta.unidades;
            totalIngresos += venta.ingresos;
        });
    } else {
        // Fallback a datos locales
        historialVentas.forEach(venta => {
            totalVendido += venta.cantidad;
            totalIngresos += venta.subtotal;
        });
    }
    
    // Actualizar métricas
    document.getElementById('producto-total-vendido').textContent = totalVendido;
    document.getElementById('producto-ingresos').textContent = '$' + formatNumber(totalIngresos);
    
    // Calcular tendencia
    const tendenciaValor = pronosticoData.tendencia;
    const tendenciaElement = document.getElementById('producto-tendencia');
    
    if (tendenciaValor > 0) {
        tendenciaElement.innerHTML = `+${tendenciaValor.toFixed(1)} <i class="fas fa-arrow-up text-success"></i>`;
    } else if (tendenciaValor < 0) {
        tendenciaElement.innerHTML = `${tendenciaValor.toFixed(1)} <i class="fas fa-arrow-down text-danger"></i>`;
    } else {
        tendenciaElement.innerHTML = `0 <i class="fas fa-equals text-warning"></i>`;
    }
    
    // Calcular rotación (Unidades vendidas / Stock promedio)
    const rotacion = totalVendido / (informacion.stock_actual || 1);
    document.getElementById('producto-rotacion').textContent = rotacion.toFixed(2);
    
    // Crear gráficos usando datos preferentemente del analytics API
    if (analyticsData.success && analyticsData.historicoVentas) {
        createProductoVentasChartFromAnalytics(analyticsData.historicoVentas);
    } else {
        createProductoVentasChart(ventasPorMes);
    }
    
    // Crear gráfico de evolución de precios si hay datos
    if (analyticsData.success && analyticsData.historicoPrecio) {
        createProductoPrecioChart(analyticsData.historicoPrecio);
    }
    
    // Crear gráfico de pronóstico
    createProductoPronosticoChart(pronosticoData);
    
    // Actualizar mensaje de pronóstico
    updatePronosticoMessage(pronosticoData, informacion);
    
    // Cargar recomendaciones basadas en patrones de compra
    loadPatronesRecomendaciones(informacion.id);
}

// Crear gráfico de ventas de producto
function createProductoVentasChart(ventasPorMes) {
    const ctx = document.getElementById('producto-ventas-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = ventasPorMes.map(item => item.mes);
    const ventasData = ventasPorMes.map(item => item.total_vendido);
    const ingresosData = ventasPorMes.map(item => parseFloat(item.ingresos_totales));
    
    // Destruir gráfico anterior si existe
    if (charts.productoVentas) {
        charts.productoVentas.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoVentas = new Chart(ctx, {
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

// Crear gráfico de pronóstico
function createProductoPronosticoChart(pronosticoData) {
    const ctx = document.getElementById('producto-pronostico-chart').getContext('2d');
    
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
    charts.productoPronostico = new Chart(ctx, {
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

// Actualizar mensaje de pronóstico
function updatePronosticoMessage(pronosticoData, informacion) {
    const mensaje = document.getElementById('producto-pronostico-mensaje');
    const alerta = document.getElementById('producto-pronostico-alerta');
    
    // Obtener datos relevantes
    const stockActual = informacion.stock_actual || 0;
    const puntoReorden = informacion.punto_reorden || 0;
    const pronostico = pronosticoData.pronostico || [];
    const tendencia = pronosticoData.tendencia || 0;
    
    // Calcular demanda total pronosticada
    let demandaTotal = 0;
    pronostico.forEach(p => {
        demandaTotal += p.cantidad_estimada;
    });
    
    // Determinar mensaje según los datos
    if (stockActual <= puntoReorden) {
        mensaje.innerHTML = `<strong>¡Alerta de stock bajo!</strong> El stock actual (${stockActual}) está por debajo del punto de reorden (${puntoReorden}).`;
        alerta.className = 'alert alert-danger mt-3';
    } else if (stockActual <= demandaTotal) {
        mensaje.innerHTML = `<strong>Posible desabastecimiento.</strong> El stock actual (${stockActual}) podría no cubrir la demanda proyectada de los próximos 3 meses (${Math.round(demandaTotal)} unidades).`;
        alerta.className = 'alert alert-warning mt-3';
    } else if (tendencia > 0) {
        mensaje.innerHTML = `<strong>Tendencia positiva.</strong> Las ventas muestran un incremento de ${tendencia.toFixed(1)} unidades por período. Stock actual suficiente para cubrir la demanda proyectada.`;
        alerta.className = 'alert alert-success mt-3';
    } else if (tendencia < 0) {
        mensaje.innerHTML = `<strong>Tendencia negativa.</strong> Las ventas muestran un decremento de ${Math.abs(tendencia).toFixed(1)} unidades por período. Considere revisar estrategias de marketing.`;
        alerta.className = 'alert alert-info mt-3';
    } else {
        mensaje.innerHTML = `<strong>Demanda estable.</strong> No se detectan cambios significativos en la tendencia de ventas. Stock actual (${stockActual}) cubre la demanda proyectada.`;
        alerta.className = 'alert alert-info mt-3';
    }
}

// Ocultar análisis de producto
function hideProductoAnalisis() {
    document.getElementById('producto-detalle').classList.add('d-none');
    document.getElementById('producto-seleccion-mensaje').classList.remove('d-none');
}

// Cargar recomendaciones basadas en patrones de compra
async function loadPatronesRecomendaciones(productoId) {
    try {
        const response = await fetch(`${API_URL}/productos/${productoId}/indicadores`);
        const data = await response.json();
        
        const patronesContainer = document.getElementById('patrones-recomendaciones');
        
        if (data.success && data.data && data.data.recomendaciones && data.data.recomendaciones.length > 0) {
            let html = '<div class="row">';
            
            data.data.recomendaciones.forEach((recomendacion, index) => {
                const confianzaPercent = (parseFloat(recomendacion.confianza) * 100).toFixed(1);
                const soporte = (parseFloat(recomendacion.soporte) * 100).toFixed(1);
                const lift = parseFloat(recomendacion.lift).toFixed(2);
                
                html += `
                    <div class="col-md-6 col-lg-4 mb-3">
                        <div class="card h-100">
                            <div class="card-body">
                                <h6 class="card-title">${recomendacion.producto_nombre}</h6>
                                <p class="card-text text-muted">Producto recomendado basado en patrones de compra</p>
                                <div class="mt-3">
                                    <small class="text-muted">
                                        <strong>Confianza:</strong> ${confianzaPercent}%<br>
                                        <strong>Soporte:</strong> ${soporte}%<br>
                                        <strong>Lift:</strong> ${lift}
                                    </small>
                                </div>
                                <div class="mt-2">
                                    <span class="badge bg-primary">Precio: $${formatNumber(recomendacion.precio)}</span>
                                </div>
                                <div class="mt-2">
                                    <button class="btn btn-sm btn-outline-primary" onclick="showProductoAnalisis(${recomendacion.producto_id})">
                                        <i class="fas fa-chart-line me-1"></i>Ver Análisis
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            
            // Agregar información del combo principal si existe
            if (data.data.combo) {
                html = `
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-lightbulb me-2"></i>
                        <strong>Recomendación Principal:</strong> ${data.data.combo}
                    </div>
                ` + html;
            }
            
            patronesContainer.innerHTML = html;
        } else {
            patronesContainer.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>No se encontraron patrones de compra para este producto.</div>';
        }
        
    } catch (error) {
        console.error('Error al cargar recomendaciones de patrones:', error);
        document.getElementById('patrones-recomendaciones').innerHTML = 
            '<div class="alert alert-warning"><i class="fas fa-exclamation-triangle me-2"></i>Error al cargar las recomendaciones.</div>';
    }
}

// Crear gráfico de ventas usando analytics API
function createProductoVentasChartFromAnalytics(historicoVentas) {
    const ctx = document.getElementById('producto-ventas-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = historicoVentas.map(item => item.periodo);
    const ventasData = historicoVentas.map(item => item.unidades);
    const ingresosData = historicoVentas.map(item => item.ingresos);
    
    // Destruir gráfico anterior si existe
    if (charts.productoVentas) {
        charts.productoVentas.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoVentas = new Chart(ctx, {
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
    const ctx = document.getElementById('producto-precio-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = historicoPrecio.map(item => item.periodo);
    const preciosData = historicoPrecio.map(item => item.precio);
    
    // Destruir gráfico anterior si existe
    if (charts.productoPrecio) {
        charts.productoPrecio.destroy();
    }
    
    // Crear nuevo gráfico
    charts.productoPrecio = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Precio ($)',
                    data: preciosData,
                    borderColor: CHART_COLORS.success,
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: CHART_COLORS.success,
                    pointBorderColor: '#ffffff',
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
                            return 'Precio: $' + formatNumber(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Trimestre'
                    }
                },
                y: {
                    beginAtZero: false,
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

// Buscar producto por nombre
async function buscarProducto(busqueda) {
    try {
        // Mostrar indicador de búsqueda
        const productoSelect = document.getElementById('producto-select');
        const originalHtml = productoSelect.innerHTML;
        productoSelect.innerHTML = '<option value="">Buscando...</option>';
        
        // Buscar en el API
        const response = await fetch(`${API_URL}/productos?search=${encodeURIComponent(busqueda)}`);
        const data = await response.json();
        
        // Restaurar select original
        productoSelect.innerHTML = originalHtml;
        
        if (data.success && data.productos && data.productos.length > 0) {
            // Mostrar panel de resultados
            mostrarPanelResultados(busqueda, data.productos);
        } else {
            // Ocultar panel y mostrar mensaje
            ocultarPanelResultados();
            alert(`No se encontraron productos para "${busqueda}"`);
        }
        
    } catch (error) {
        console.error('Error en búsqueda de producto:', error);
        
        // Restaurar select en caso de error
        const productoSelect = document.getElementById('producto-select');
        await initProductosList(); // Recargar la lista original
        
        ocultarPanelResultados();
        alert('Error al buscar el producto. Intente nuevamente.');
    }
}

// Mostrar panel de resultados de búsqueda
function mostrarPanelResultados(termino, productos) {
    const panel = document.getElementById('busqueda-resultados-panel');
    const terminoElement = document.getElementById('busqueda-termino');
    const contenido = document.getElementById('busqueda-resultados-contenido');
    
    // Actualizar término de búsqueda
    terminoElement.textContent = `"${termino}" (${productos.length} resultados)`;
    
    // Mostrar panel
    panel.classList.remove('d-none');
    
    // Paginar resultados (mostrar 12 por página)
    const productosPorPagina = 12;
    const totalPaginas = Math.ceil(productos.length / productosPorPagina);
    let paginaActual = 1;
    
    function mostrarPagina(pagina) {
        const inicio = (pagina - 1) * productosPorPagina;
        const fin = inicio + productosPorPagina;
        const productosPagina = productos.slice(inicio, fin);
        
        let html = '';
        productosPagina.forEach(producto => {
            html += `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="producto-resultado" data-producto-id="${producto.id}" onclick="seleccionarProductoDeBusqueda(${producto.id}, '${producto.nombre.replace(/'/g, "\\'")}')">
                        <div class="producto-nombre">${producto.nombre}</div>
                        <div class="producto-info">
                            <div><strong>ID:</strong> ${producto.id}</div>
                            <div><strong>Precio:</strong> $${formatNumber(producto.precio_actual || 0)}</div>
                            <div><strong>Stock:</strong> ${producto.stock_actual || 0}</div>
                        </div>
                        ${producto.categoria ? `<div class="producto-categoria">${producto.categoria}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        contenido.innerHTML = html;
        
        // Actualizar paginación
        if (totalPaginas > 1) {
            actualizarPaginacion(pagina, totalPaginas);
        } else {
            document.getElementById('busqueda-paginacion').classList.add('d-none');
        }
    }
    
    function actualizarPaginacion(pagina, total) {
        const paginacion = document.getElementById('busqueda-paginacion');
        const btnAnterior = document.getElementById('btn-anterior-pagina');
        const btnSiguiente = document.getElementById('btn-siguiente-pagina');
        const paginaActualElement = document.getElementById('pagina-actual');
        
        paginaActualElement.textContent = `${pagina} de ${total}`;
        
        // Habilitar/deshabilitar botones
        if (pagina <= 1) {
            btnAnterior.classList.add('disabled');
        } else {
            btnAnterior.classList.remove('disabled');
        }
        
        if (pagina >= total) {
            btnSiguiente.classList.add('disabled');
        } else {
            btnSiguiente.classList.remove('disabled');
        }
        
        // Event listeners para paginación
        btnAnterior.onclick = (e) => {
            e.preventDefault();
            if (pagina > 1) {
                paginaActual--;
                mostrarPagina(paginaActual);
            }
        };
        
        btnSiguiente.onclick = (e) => {
            e.preventDefault();
            if (pagina < total) {
                paginaActual++;
                mostrarPagina(paginaActual);
            }
        };
        
        paginacion.classList.remove('d-none');
    }
    
    // Mostrar primera página
    mostrarPagina(1);
    
    // Configurar botón cerrar
    document.getElementById('btn-cerrar-busqueda').onclick = ocultarPanelResultados;
}

// Ocultar panel de resultados
function ocultarPanelResultados() {
    const panel = document.getElementById('busqueda-resultados-panel');
    panel.classList.add('d-none');
}

// Seleccionar producto desde el panel de búsqueda
async function seleccionarProductoDeBusqueda(productoId, nombreProducto) {
    try {
        // Agregar producto al select si no existe
        const productoSelect = document.getElementById('producto-select');
        let optionExists = false;
        
        for (let i = 0; i < productoSelect.options.length; i++) {
            if (productoSelect.options[i].value == productoId) {
                optionExists = true;
                break;
            }
        }
        
        if (!optionExists) {
            const newOption = document.createElement('option');
            newOption.value = productoId;
            newOption.textContent = nombreProducto;
            productoSelect.insertBefore(newOption, productoSelect.options[1]);
        }
        
        // Seleccionar el producto
        productoSelect.value = productoId;
        
        // Ocultar panel de resultados
        ocultarPanelResultados();
        
        // Mostrar análisis del producto
        await showProductoAnalisis(productoId);
        
        // Resaltar producto seleccionado
        const productosResultado = document.querySelectorAll('.producto-resultado');
        productosResultado.forEach(p => p.classList.remove('selected'));
        
        const productoSeleccionado = document.querySelector(`[data-producto-id="${productoId}"]`);
        if (productoSeleccionado) {
            productoSeleccionado.classList.add('selected');
        }
        
    } catch (error) {
        console.error('Error al seleccionar producto:', error);
        alert('Error al cargar el análisis del producto');
    }
}

// Filtrar productos por categoría
function filterProductosByCategoria(categoria) {
    // Actualizar título
    const tituloElement = document.getElementById('categoria-titulo');
    const topTituloElement = document.getElementById('categoria-top-titulo');
    
    if (categoria) {
        tituloElement.textContent = `Ventas de Categoría: ${categoria}`;
        topTituloElement.textContent = `Top Productos de la Categoría: ${categoria}`;
    } else {
        tituloElement.textContent = 'Ventas por Categoría';
        topTituloElement.textContent = 'Top Productos por Categoría';
    }
    
    // Cargar productos de la categoría desde el servidor
    loadProductosPorCategoria(categoria);
}

// Cargar productos por categoría
async function loadProductosPorCategoria(categoria) {
    try {
        const url = categoria 
            ? `${API_URL}/productos/por-categoria?categoria=${encodeURIComponent(categoria)}`
            : `${API_URL}/productos/por-categoria`;
            
        const response = await fetch(url);
        const productos = await response.json();
        
        // Actualizar tabla
        const tablaBody = document.getElementById('categoria-top-tabla').querySelector('tbody');
        
        if (productos.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay productos disponibles para esta categoría</td></tr>';
            return;
        }
        
        // Calcular total de la categoría para porcentajes
        const totalVentasCategoria = productos.reduce((sum, p) => sum + p.total_vendido, 0);
        
        let html = '';
        productos.slice(0, 10).forEach((producto, index) => {
            const porcentaje = totalVentasCategoria > 0 
                ? (producto.total_vendido / totalVentasCategoria * 100).toFixed(1)
                : '0.0';
            
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${producto.nombre}</td>
                    <td>${producto.categoria || 'No especificada'}</td>
                    <td>${formatNumber(producto.total_vendido)}</td>
                    <td>$${formatNumber(producto.ingresos_totales)}</td>
                    <td>${porcentaje}%</td>
                </tr>
            `;
        });
        
        tablaBody.innerHTML = html;
        
    } catch (error) {
        console.error('Error al cargar productos por categoría:', error);
        const tablaBody = document.getElementById('categoria-top-tabla').querySelector('tbody');
        tablaBody.innerHTML = '<tr><td colspan="6" class="text-center">Error al cargar datos</td></tr>';
    }
}

// Cargar datos de tendencias
function loadTendenciasData() {
    if (storeData.tendencias.length > 0) {
        // Ya tenemos los datos, solo crear gráficos
        createTendenciasFullCharts(storeData.tendencias);
    } else {
        // Cargar datos
        fetch(`${API_URL}/ventas/tendencias`)
            .then(response => response.json())
            .then(data => {
                storeData.tendencias = data;
                createTendenciasFullCharts(data);
            })
            .catch(error => {
                console.error('Error al cargar tendencias:', error);
            });
    }
}

// Crear gráficos completos de tendencias
function createTendenciasFullCharts(data) {
    // Inicializar fechas si no están establecidas
    if (!document.getElementById('tendencias-desde').value) {
        if (data.length > 0) {
            // Establecer fecha inicial como 6 meses antes de la fecha final
            const fechas = data.map(item => item.periodo);
            const fechaInicial = fechas[Math.max(0, fechas.length - 7)]; // Comenzar 6 meses antes
            const fechaFinal = fechas[fechas.length - 1];
            
            document.getElementById('tendencias-desde').value = fechaInicial + '-01';
            document.getElementById('tendencias-hasta').value = fechaFinal + '-28';
        }
    }
    
    // Crear gráficos filtrados por las fechas seleccionadas
    updateTendenciasChart();
}

// Actualizar gráfico de tendencias
function updateTendenciasChart() {
    const periodo = document.getElementById('tendencias-periodo').value;
    const fechaDesde = document.getElementById('tendencias-desde').value;
    const fechaHasta = document.getElementById('tendencias-hasta').value;
    
    // Filtrar datos según el periodo y fechas
    const datosFiltrados = filtrarDatosPorFecha(storeData.tendencias, fechaDesde, fechaHasta);
    
    // Agrupar datos según el periodo seleccionado
    const datosAgrupados = agruparDatosPorPeriodo(datosFiltrados, periodo);
    
    // Crear gráficos con los datos filtrados
    crearGraficoTendenciasVentas(datosAgrupados);
    crearGraficoTendenciasIngresos(datosAgrupados);
    crearGraficoTendenciasCategorias(datosAgrupados);
    actualizarTablaTendencias(datosAgrupados);
}

// Filtrar datos por fecha
function filtrarDatosPorFecha(datos, fechaDesde, fechaHasta) {
    if (!fechaDesde && !fechaHasta) return datos;
    
    return datos.filter(item => {
        const periodo = item.periodo;
        
        if (fechaDesde && periodo < fechaDesde.substring(0, 7)) return false;
        if (fechaHasta && periodo > fechaHasta.substring(0, 7)) return false;
        
        return true;
    });
}

// Agrupar datos por periodo
function agruparDatosPorPeriodo(datos, tipoPeriodo) {
    if (tipoPeriodo === 'mensual') {
        // Ya están agrupados por mes, no hacemos nada
        return datos;
    } else if (tipoPeriodo === 'trimestral') {
        // Agrupar por trimestre
        const porTrimestre = {};
        
        datos.forEach(item => {
            const partes = item.periodo.split('-');
            const anio = partes[0];
            const mes = parseInt(partes[1]);
            const trimestre = Math.ceil(mes / 3);
            const claveTrimestre = `${anio}-T${trimestre}`;
            
            if (!porTrimestre[claveTrimestre]) {
                porTrimestre[claveTrimestre] = {
                    periodo: claveTrimestre,
                    total_vendido: 0,
                    ingresos_totales: 0,
                    numero_transacciones: 0
                };
            }
            
            porTrimestre[claveTrimestre].total_vendido += item.total_vendido;
            porTrimestre[claveTrimestre].ingresos_totales += parseFloat(item.ingresos_totales);
            porTrimestre[claveTrimestre].numero_transacciones += item.numero_transacciones;
        });
        
        return Object.values(porTrimestre).sort((a, b) => a.periodo.localeCompare(b.periodo));
    } else if (tipoPeriodo === 'anual') {
        // Agrupar por año
        const porAnio = {};
        
        datos.forEach(item => {
            const anio = item.periodo.split('-')[0];
            
            if (!porAnio[anio]) {
                porAnio[anio] = {
                    periodo: anio,
                    total_vendido: 0,
                    ingresos_totales: 0,
                    numero_transacciones: 0
                };
            }
            
            porAnio[anio].total_vendido += item.total_vendido;
            porAnio[anio].ingresos_totales += parseFloat(item.ingresos_totales);
            porAnio[anio].numero_transacciones += item.numero_transacciones;
        });
        
        return Object.values(porAnio).sort((a, b) => a.periodo.localeCompare(b.periodo));
    }
    
    return datos;
}

// Crear gráfico de tendencias de ventas
function crearGraficoTendenciasVentas(datos) {
    const ctx = document.getElementById('tendencias-ventas-chart').getContext('2d');
    
    // Preparar datos para el gráfico
    const labels = datos.map(item => item.periodo);
    const ventasData = datos.map(item => item.total_vendido);
    const ingresosData = datos.map(item => parseFloat(item.ingresos_totales));
    const transaccionesData = datos.map(item => item.numero_transacciones);
    
    // Destruir gráfico anterior si existe
    if (charts.tendenciasVentas) {
        charts.tendenciasVentas.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendenciasVentas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Unidades Vendidas',
                    data: ventasData,
                    backgroundColor: CHART_COLORS.primary,
                    order: 2,
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
                    order: 1,
                    yAxisID: 'y1'
                },
                {
                    type: 'line',
                    label: 'Transacciones',
                    data: transaccionesData,
                    borderColor: CHART_COLORS.success,
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    borderDash: [5, 5],
                    order: 0,
                    yAxisID: 'y2'
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
                                label += formatNumber(context.raw) + ' unidades';
                            } else if (context.datasetIndex === 1) {
                                label += '$' + formatNumber(context.raw);
                            } else {
                                label += formatNumber(context.raw);
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
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

// Crear gráfico de tendencias de ingresos
function crearGraficoTendenciasIngresos(datos) {
    const ctx = document.getElementById('tendencias-ingresos-chart').getContext('2d');
    
    // Calcular ingresos por unidad
    const datosProcessed = datos.map(item => ({
        periodo: item.periodo,
        ingresos: parseFloat(item.ingresos_totales),
        unidades: item.total_vendido,
        valorPromedio: item.total_vendido ? parseFloat(item.ingresos_totales) / item.total_vendido : 0
    }));
    
    // Preparar datos para el gráfico
    const labels = datosProcessed.map(item => item.periodo);
    const ingresosData = datosProcessed.map(item => item.ingresos);
    const unidadesData = datosProcessed.map(item => item.unidades);
    const valorPromedioData = datosProcessed.map(item => item.valorPromedio);
    
    // Destruir gráfico anterior si existe
    if (charts.tendenciasIngresos) {
        charts.tendenciasIngresos.destroy();
    }
    
    // Crear nuevo gráfico
    charts.tendenciasIngresos = new Chart(ctx, {
        type: 'scatter',
        data: {
            labels: labels,
            datasets: [{
                type: 'scatter',
                label: 'Ingresos vs Unidades',
                data: datosProcessed.map(item => ({
                    x: item.unidades,
                    y: item.ingresos,
                    r: item.valorPromedio * 0.1 + 5 // Tamaño según valor promedio
                })),
                backgroundColor: datosProcessed.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length]),
                borderWidth: 1,
                borderColor: '#fff'
            }]
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
                            const index = context.dataIndex;
                            const item = datosProcessed[index];
                            return [
                                `Periodo: ${item.periodo}`,
                                `Unidades: ${formatNumber(item.unidades)}`,
                                `Ingresos: $${formatNumber(item.ingresos)}`,
                                `Valor por unidad: $${formatNumber(item.valorPromedio)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Unidades Vendidas'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Ingresos ($)'
                    }
                }
            }
        }
    });
}

// Crear gráfico de tendencias por categoría
function crearGraficoTendenciasCategorias(datos) {
    // Este es un placeholder, necesitamos datos por categoría para implementarlo
    console.log('Gráfico de tendencias por categoría no implementado');
}

// Actualizar tabla de tendencias
function actualizarTablaTendencias(datos) {
    const tabla = document.getElementById('tendencias-tabla').querySelector('tbody');
    
    if (datos.length === 0) {
        tabla.innerHTML = '<tr><td colspan="6" class="text-center">No hay datos disponibles para el período seleccionado</td></tr>';
        return;
    }
    
    let html = '';
    datos.forEach((item, index) => {
        // Calcular ticket promedio
        const ticketPromedio = item.numero_transacciones ? parseFloat(item.ingresos_totales) / item.numero_transacciones : 0;
        
        // Calcular tendencia (comparado con el período anterior)
        let tendenciaIcon = '';
        let tendenciaClass = '';
        
        if (index > 0) {
            const cambio = item.total_vendido - datos[index - 1].total_vendido;
            const porcentaje = datos[index - 1].total_vendido ? (cambio / datos[index - 1].total_vendido) * 100 : 0;
            
            if (porcentaje > 5) {
                tendenciaIcon = `<i class="fas fa-arrow-up text-success"></i> +${porcentaje.toFixed(1)}%`;
                tendenciaClass = 'text-success';
            } else if (porcentaje < -5) {
                tendenciaIcon = `<i class="fas fa-arrow-down text-danger"></i> ${porcentaje.toFixed(1)}%`;
                tendenciaClass = 'text-danger';
            } else {
                tendenciaIcon = `<i class="fas fa-equals text-warning"></i> ${porcentaje.toFixed(1)}%`;
                tendenciaClass = 'text-warning';
            }
        } else {
            tendenciaIcon = '-';
        }
        
        html += `
            <tr>
                <td>${item.periodo}</td>
                <td>${formatNumber(item.total_vendido)}</td>
                <td>$${formatNumber(item.ingresos_totales)}</td>
                <td>${formatNumber(item.numero_transacciones)}</td>
                <td>$${formatNumber(ticketPromedio)}</td>
                <td class="${tendenciaClass}">${tendenciaIcon}</td>
            </tr>
        `;
    });
    
    tabla.innerHTML = html;
}

// === FUNCIONES DE REPORTES ===

// Inicializar sección de reportes
function initReportesSection() {
    // Configurar fechas por defecto (último mes)
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);
    
    document.getElementById('reporte-desde').value = hace30Dias.toISOString().split('T')[0];
    document.getElementById('reporte-hasta').value = hoy.toISOString().split('T')[0];
    
    // Llenar select de categorías
    fillReporteSelects();
    
    // Configurar event handlers
    setupReportesEventHandlers();
}

// Llenar los selects de categorías y productos para reportes
async function fillReporteSelects() {
    try {
        // Llenar categorías
        if (storeData.categorias && storeData.categorias.length > 0) {
            const categoriaSelect = document.getElementById('reporte-categoria');
            let optionsHtml = '<option value="">Todas las categorías</option>';
            
            storeData.categorias.forEach(categoria => {
                optionsHtml += `<option value="${categoria.categoria}">${categoria.categoria}</option>`;
            });
            
            categoriaSelect.innerHTML = optionsHtml;
        }
        
        // Llenar productos
        if (storeData.productos && storeData.productos.length > 0) {
            const productoSelect = document.getElementById('reporte-producto');
            let optionsHtml = '<option value="">Todos los productos</option>';
            
            storeData.productos.forEach(producto => {
                optionsHtml += `<option value="${producto.producto_id}">${producto.nombre}</option>`;
            });
            
            productoSelect.innerHTML = optionsHtml;
        }
    } catch (error) {
        console.error('Error al llenar selects de reportes:', error);
    }
}

// Configurar event handlers para reportes
function setupReportesEventHandlers() {
    document.getElementById('btn-vista-previa').addEventListener('click', generarVistaPrevia);
    document.getElementById('btn-generar-reporte').addEventListener('click', descargarReporte);
    document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltrosReporte);
}

// Generar vista previa del reporte
async function generarVistaPrevia() {
    try {
        const params = getReporteParams();
        
        if (!params.desde || !params.hasta) {
            alert('Por favor seleccione las fechas desde y hasta');
            return;
        }
        
        // Mostrar loading
        showReporteLoading();
        
        // Construir URL con parámetros
        const url = new URL(`${API_URL}/reportes`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key]) url.searchParams.append(key, params[key]);
        });
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            mostrarVistaPrevia(data);
        } else {
            alert('Error al generar reporte: ' + data.error);
        }
        
    } catch (error) {
        console.error('Error al generar vista previa:', error);
        alert('Error al generar la vista previa del reporte');
    }
}

// Obtener parámetros del reporte
function getReporteParams() {
    return {
        tipo: document.getElementById('reporte-tipo').value,
        desde: document.getElementById('reporte-desde').value,
        hasta: document.getElementById('reporte-hasta').value,
        categoria: document.getElementById('reporte-categoria').value,
        producto: document.getElementById('reporte-producto').value,
        formato: document.getElementById('reporte-formato').value
    };
}

// Mostrar loading del reporte
function showReporteLoading() {
    const preview = document.getElementById('reporte-preview');
    const tbody = document.getElementById('reporte-tabla-body');
    
    preview.classList.remove('d-none');
    tbody.innerHTML = '<tr><td colspan="100%" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>Generando reporte...</td></tr>';
}

// Ocultar loading del reporte
function hideReporteLoading() {
    const tbody = document.getElementById('reporte-tabla-body');
    tbody.innerHTML = '<tr><td colspan="100%" class="text-center"><i class="fas fa-info-circle me-2"></i>Seleccione las fechas y haga clic en "Vista Previa" para ver los datos</td></tr>';
}

// Mostrar mensaje de éxito en la tabla
function showReporteSuccess(message) {
    const tbody = document.getElementById('reporte-tabla-body');
    tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-success"><i class="fas fa-check-circle me-2"></i>${message}</td></tr>`;
    
    // Volver al estado normal después de 3 segundos
    setTimeout(() => {
        hideReporteLoading();
    }, 3000);
}

// Mostrar mensaje de error en la tabla
function showReporteError(message) {
    const tbody = document.getElementById('reporte-tabla-body');
    tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-danger"><i class="fas fa-exclamation-triangle me-2"></i>${message}</td></tr>`;
    
    // Volver al estado normal después de 5 segundos
    setTimeout(() => {
        hideReporteLoading();
    }, 5000);
}

// Mostrar vista previa del reporte
function mostrarVistaPrevia(data) {
    const preview = document.getElementById('reporte-preview');
    preview.classList.remove('d-none');
    
    // Actualizar resumen
    document.getElementById('reporte-total-registros').textContent = `${data.resumen.total_registros} registros`;
    document.getElementById('reporte-total-ventas').textContent = formatNumber(data.resumen.total_vendido);
    document.getElementById('reporte-total-ingresos').textContent = '$' + formatNumber(data.resumen.ingresos_totales);
    document.getElementById('reporte-total-transacciones').textContent = formatNumber(data.resumen.numero_transacciones || 0);
    document.getElementById('reporte-ticket-promedio').textContent = '$' + formatNumber(data.resumen.ticket_promedio || 0);
    
    // Crear gráfico
    createReporteChart(data);
    
    // Llenar tabla
    fillReporteTable(data);
}

// Crear gráfico del reporte
function createReporteChart(data) {
    const ctx = document.getElementById('reporte-chart');
    if (!ctx) return;
    
    const context = ctx.getContext('2d');
    
    // Destruir gráfico anterior si existe
    if (charts.reporte) {
        charts.reporte.destroy();
    }
    
    let chartConfig = {};
    
    switch (data.tipo) {
        case 'ventas':
            chartConfig = {
                type: 'line',
                data: {
                    labels: data.datos.map(item => item.fecha),
                    datasets: [{
                        label: 'Ingresos por Día',
                        data: data.datos.map(item => parseFloat(item.ingresos_totales)),
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                }
            };
            break;
            
        case 'productos':
            chartConfig = {
                type: 'bar',
                data: {
                    labels: data.datos.slice(0, 10).map(item => item.nombre.substring(0, 20) + '...'),
                    datasets: [{
                        label: 'Unidades Vendidas',
                        data: data.datos.slice(0, 10).map(item => item.total_vendido),
                        backgroundColor: '#3498db'
                    }]
                }
            };
            break;
            
        case 'categorias':
            chartConfig = {
                type: 'doughnut',
                data: {
                    labels: data.datos.map(item => item.categoria),
                    datasets: [{
                        data: data.datos.map(item => item.total_vendido),
                        backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6']
                    }]
                }
            };
            break;
    }
    
    chartConfig.options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top'
            }
        }
    };
    
    charts.reporte = new Chart(context, chartConfig);
}

// Llenar tabla del reporte
function fillReporteTable(data) {
    const header = document.getElementById('reporte-tabla-header');
    const tbody = document.getElementById('reporte-tabla-body');
    
    // Configurar headers según el tipo
    let headers = [];
    
    switch (data.tipo) {
        case 'ventas':
            headers = ['Fecha', 'Transacciones', 'Unidades Vendidas', 'Ingresos', 'Precio Promedio', 'Productos Diferentes'];
            break;
        case 'productos':
            headers = ['Producto', 'Categoría', 'Precio Actual', 'Unidades Vendidas', 'Ingresos', 'Transacciones'];
            break;
        case 'categorias':
            headers = ['Categoría', 'Cantidad Productos', 'Unidades Vendidas', 'Ingresos', 'Transacciones'];
            break;
    }
    
    // Crear header
    header.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    
    // Llenar datos
    let html = '';
    data.datos.forEach(row => {
        html += '<tr>';
        
        switch (data.tipo) {
            case 'ventas':
                html += `
                    <td>${row.fecha}</td>
                    <td>${row.numero_transacciones}</td>
                    <td>${formatNumber(row.total_vendido)}</td>
                    <td>$${formatNumber(row.ingresos_totales)}</td>
                    <td>$${formatNumber(row.precio_promedio)}</td>
                    <td>${row.productos_diferentes}</td>
                `;
                break;
            case 'productos':
                html += `
                    <td>${row.nombre}</td>
                    <td>${row.categoria}</td>
                    <td>$${formatNumber(row.precio_actual)}</td>
                    <td>${formatNumber(row.total_vendido)}</td>
                    <td>$${formatNumber(row.ingresos_totales)}</td>
                    <td>${row.numero_transacciones}</td>
                `;
                break;
            case 'categorias':
                html += `
                    <td>${row.categoria}</td>
                    <td>${row.cantidad_productos}</td>
                    <td>${formatNumber(row.total_vendido)}</td>
                    <td>$${formatNumber(row.ingresos_totales)}</td>
                    <td>${row.numero_transacciones}</td>
                `;
                break;
        }
        
        html += '</tr>';
    });
    
    tbody.innerHTML = html;
}

// Descargar reporte
async function descargarReporte() {
    try {
        const params = getReporteParams();
        
        if (!params.desde || !params.hasta) {
            alert('Por favor seleccione las fechas desde y hasta');
            return;
        }
        
        // Mostrar loading
        showReporteLoading();
        
        // Primero obtener los datos JSON para mostrar en la vista previa
        const dataUrl = new URL(`${API_URL}/reportes`, window.location.origin);
        const dataParams = { ...params, formato: 'json' }; // Forzar formato JSON para obtener datos
        Object.keys(dataParams).forEach(key => {
            if (dataParams[key]) dataUrl.searchParams.append(key, dataParams[key]);
        });
        
        const dataResponse = await fetch(dataUrl);
        const data = await dataResponse.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al obtener datos del reporte');
        }
        
        // Mostrar los datos en la vista previa
        mostrarVistaPrevia(data);
        
        // Ahora descargar el archivo en el formato solicitado
        const fileUrl = new URL(`${API_URL}/reportes`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key]) fileUrl.searchParams.append(key, params[key]);
        });
        
        const fileResponse = await fetch(fileUrl);
        
        if (!fileResponse.ok) {
            throw new Error('Error al generar el archivo del reporte');
        }
        
        // Determinar el nombre del archivo
        const formato = params.formato || 'json';
        let filename;
        
        switch (formato) {
            case 'pdf':
                filename = `reporte_${params.tipo}_${params.desde}_${params.hasta}.pdf`;
                break;
            case 'excel':
            case 'xlsx':
                filename = `reporte_${params.tipo}_${params.desde}_${params.hasta}.xlsx`;
                break;
            default:
                filename = `reporte_${params.tipo}_${params.desde}_${params.hasta}.json`;
        }
        
        // Obtener el blob del archivo
        const blob = await fileResponse.blob();
        
        // Crear enlace de descarga
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        
        // Mostrar mensaje de éxito en la tabla
        const tbody = document.getElementById('reporte-tabla-body');
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-success"><i class="fas fa-check-circle me-2"></i>Reporte generado y descargado exitosamente como ${formato.toUpperCase()}</td></tr>`;
        
    } catch (error) {
        console.error('Error al descargar reporte:', error);
        
        // Mostrar error en la tabla
        const tbody = document.getElementById('reporte-tabla-body');
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error al generar el reporte: ${error.message}</td></tr>`;
    }
}

// Limpiar filtros del reporte
function limpiarFiltrosReporte() {
    document.getElementById('reporte-tipo').value = 'ventas';
    document.getElementById('reporte-formato').value = 'json';
    document.getElementById('reporte-categoria').value = '';
    document.getElementById('reporte-producto').value = '';
    
    // Limpiar preview
    document.getElementById('reporte-preview').classList.add('d-none');
    
    // Configurar fechas por defecto
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);
    
    document.getElementById('reporte-desde').value = hace30Dias.toISOString().split('T')[0];
    document.getElementById('reporte-hasta').value = hoy.toISOString().split('T')[0];
}

// Utilidad para formatear números
function formatNumber(value) {
    if (value === undefined || value === null) return '0';
    
    // Convertir a número si es string
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    // Verificar si es entero
    if (Number.isInteger(num)) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // Formatear con dos decimales
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Mostrar mensaje de error
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger alert-dismissible fade show';
    errorDiv.innerHTML = `
        <strong>Error:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.querySelector('.container').prepend(errorDiv);
    
    // Eliminar después de 10 segundos
    setTimeout(() => {
        errorDiv.remove();
    }, 10000);
}

// Procesar parámetros de URL
function procesarParametrosURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const seccion = urlParams.get('seccion');
    const buscar = urlParams.get('buscar');
    
    // Si hay una sección específica, cambiar a ella
    if (seccion) {
        // Actualizar navegación
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === seccion) {
                link.classList.add('active');
            }
        });
        
        // Mostrar sección correspondiente
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('d-none');
        });
        
        const sectionElement = document.getElementById(seccion);
        if (sectionElement) {
            sectionElement.classList.remove('d-none');
        }
    }
    
    // Si hay un término de búsqueda, ejecutar búsqueda
    if (buscar && seccion === 'productos') {
        // Esperar a que se carguen los datos iniciales
        setTimeout(() => {
            const busquedaInput = document.getElementById('producto-busqueda');
            if (busquedaInput) {
                busquedaInput.value = buscar;
                buscarProducto(buscar);
            }
        }, 1000);
    }
}