USE tienda_bd;

-- Eliminar procedimiento existente
DROP PROCEDURE IF EXISTS CalcularPatronesCompra;

-- Crear el procedimiento almacenado mejorado
DELIMITER //
CREATE PROCEDURE CalcularPatronesCompra()
BEGIN
    -- Registrar inicio
    INSERT INTO LogProcesos (proceso, mensaje) VALUES ('CalcularPatronesCompra', 'Iniciando cálculo de patrones');
    
    -- Crear tabla temporal de log para seguimiento
    DROP TEMPORARY TABLE IF EXISTS TempLogPatrones;
    CREATE TEMPORARY TABLE TempLogPatrones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        etapa VARCHAR(100),
        descripcion TEXT,
        tiempo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Registrar inicio
    INSERT INTO TempLogPatrones (etapa, descripcion) VALUES ('Inicio', 'Comenzando procedimiento');
    
    -- Paso 1: Contar patrones actuales
    INSERT INTO TempLogPatrones (etapa, descripcion) 
    SELECT 'Conteo inicial', CONCAT('Patrones existentes: ', COUNT(*)) FROM PatronesCompra;
    
    -- Paso 2: Limpiar tabla existente (opcional)
    -- TRUNCATE TABLE PatronesCompra;
    -- INSERT INTO TempLogPatrones (etapa, descripcion) VALUES ('Limpieza', 'Tabla PatronesCompra limpiada');
    
    -- Paso 3: Preparar datos de antecedentes
    INSERT INTO TempLogPatrones (etapa, descripcion) VALUES ('Preparación', 'Generando antecedentes');
    
    -- Calcular patrones e insertar
    INSERT INTO TempLogPatrones (etapa, descripcion) VALUES ('Cálculo', 'Insertando patrones');
    
    INSERT INTO PatronesCompra (antecedente, consecuente, soporte, confianza, lift)
    WITH Antecedentes AS (
        SELECT transaccion_id, JSON_ARRAYAGG(producto_id) AS ante_array
        FROM HechosVentas
        GROUP BY transaccion_id
        HAVING COUNT(*) > 1  -- Solo transacciones con más de un producto
    )
    SELECT 
        a.ante_array AS antecedente,
        b.producto_id AS consecuente,
        (COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / 
         (SELECT COUNT(DISTINCT transaccion_id) FROM HechosVentas)) AS soporte,
         
        (COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / 
         COUNT(DISTINCT a.transaccion_id)) AS confianza,
         
        ((COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / 
          COUNT(DISTINCT a.transaccion_id)) / 
         (COUNT(DISTINCT b.transaccion_id) / (SELECT COUNT(DISTINCT transaccion_id) FROM HechosVentas))) AS lift
         
    FROM Antecedentes a
    JOIN HechosVentas b ON a.transaccion_id = b.transaccion_id
    GROUP BY a.ante_array, b.producto_id
    HAVING soporte > 0.001  -- Umbral de soporte reducido
       AND confianza > 0.2  -- Umbral de confianza reducido
       AND lift > 1.0;      -- Lift mayor a 1 indica correlación positiva
    
    -- Paso 4: Registrar resultados
    INSERT INTO TempLogPatrones (etapa, descripcion) 
    SELECT 'Finalización', CONCAT('Patrones generados: ', COUNT(*)) FROM PatronesCompra;
    
    -- Mostrar log temporal
    SELECT * FROM TempLogPatrones ORDER BY tiempo;
    
    -- Registrar fin
    INSERT INTO LogProcesos (proceso, mensaje) 
    SELECT 'CalcularPatronesCompra', CONCAT('Proceso finalizado. Patrones generados: ', COUNT(*)) 
    FROM PatronesCompra;
END //
DELIMITER ;

-- Crear tabla de log si no existe
CREATE TABLE IF NOT EXISTS LogProcesos (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    proceso VARCHAR(100),
    mensaje TEXT,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ejecutar el procedimiento
CALL CalcularPatronesCompra();

-- Ver resultados
SELECT * FROM PatronesCompra ORDER BY confianza DESC, lift DESC LIMIT 20;