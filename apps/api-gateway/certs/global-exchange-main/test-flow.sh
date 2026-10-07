#!/bin/bash
USER_ID="trader_$(date +%s)"
echo "🔄 1. Registrando novo usuário dinâmico ($USER_ID)..."
curl -s -X POST http://localhost:3000/api/register -H "Content-Type: application/json" -d "{\"username\":\"$USER_ID\",\"password\":\"password123\"}" > /dev/null
sleep 1
echo "🔑 2. Realizando Login para obter Token JWT..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"username\":\"$USER_ID\",\"password\":\"password123\"}")
TOKEN=$(echo "$RESPONSE" | awk -F'"token":"' '{print $2}' | awk -F'"' '{print $1}')
if [ -z "$TOKEN" ]; then echo "❌ Erro ao obter Token JWT. Resposta do servidor: $RESPONSE"; exit 1; else echo "✅ Token JWT obtido com sucesso!"; fi
echo "📡 3. Despachando Ordem de Teste para o Motor..."
curl -X POST http://localhost:3000/api/order -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"id\":\"ord_cli_1\",\"price\":100.0,\"amount\":1.5,\"side\":\"BUY\"}"
