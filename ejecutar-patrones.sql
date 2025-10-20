USE tienda_bd;

-- Ejecutar el procedimiento para calcular patrones
CALL CalcularPatronesCompra();

-- Consultar los resultados
SELECT 
    p.patron_id,
    p.antecedente,
    dp1.nombre AS nombre_antecedente,
    p.consecuente, 
    dp2.nombre AS nombre_consecuente,
    ROUND(p.soporte * 100, 2) AS soporte_porcentaje,
    ROUND(p.confianza * 100, 2) AS confianza_porcentaje,
    ROUND(p.lift, 2) AS lift,
    p.fecha_calculo
FROM 
    PatronesCompra p
    JOIN DimensionProductos dp1 ON p.antecedente = dp1.producto_id
    JOIN DimensionProductos dp2 ON p.consecuente = dp2.producto_id
ORDER BY 
    p.lift DESC, p.confianza DESC
LIMIT 50;
