# Использование DeviceHub API для запуска автотестов

DeviceHub предоставляет специализированное API для автотестов, которое позволяет захватывать устройства для тестовых прогонов и освобождать их после завершения .

## Основные API endpoints для автотестов

### 1. Захват устройств для автотестов

Используйте endpoint `/autotests/captureDevices` для создания группы устройств для тестового прогона:

**Параметры запроса:**
- `amount` - количество устройств (обязательный)
- `timeout` - таймаут в секундах (обязательный, максимум 3 часа)
- `run` - идентификатор тестового прогона (обязательный)
- `need_amount` - строгое соответствие количества устройств

**Фильтры устройств:**
- `abi` - архитектура процессора
- `model` - модель устройства
- `type` - тип устройства
- `sdk` - уровень SDK
- `version` - версия Android

### 2. Освобождение устройств

Используйте endpoint `/autotests/freeDevices` для освобождения группы устройств после завершения тестов.

## Пример использования Python клиента

### Создание группы автотестов

```python  
from devicehub_client.api.autotests import capture_devices  
  
response = capture_devices.sync_detailed(  
    client=api_client,  
    timeout=600,  
    amount=2,  
    need_amount=True,  
    abi='armeabi-v7a',  
    run='Test-run-example',  
    sdk=UNSET,   
    model=UNSET,  
    type=UNSET,  
    version=UNSET  
)  
```

### Извлечение данных из ответа

После успешного создания группы вы получите объект `AutoTestResponse` с полями:

- `success` - статус операции
- `description` - описание результата
- `group` - объект группы с устройствами
- `group.id` - идентификатор группы
- `group.devices` - список захваченных устройств

В случае с android самое нужное поле - `remoteConnectUrl`, которое содержит адрес для подключения по adb
Также, это поле для iOS содержит ссылку для подключения к Appium WDA

### Освобождение устройств

```python  
from devicehub_client.api.autotests import free_devices  
  
response = free_devices.sync_detailed(  
    client=api_client,   
    group=autotests_group_id  
)  
```

## Генерация клиента из Swagger схемы

DeviceHub использует OpenAPI/Swagger для документирования API. Swagger документация доступна по адресу `/api/v1/swagger.json`.

### Автоматическая генерация клиента

Вы можете сгенерировать клиент для любого языка программирования используя Swagger Codegen :

```bash  
# Для Python  [header-1](#header-1)
swagger-codegen generate -i https://your-devicehub.com/api/v1/swagger.json -l python -o ./devicehub-client  
  
# Для Java  [header-2](#header-2)
swagger-codegen generate -i https://your-devicehub.com/api/v1/swagger.json -l java -o ./devicehub-client  
  
# Для JavaScript  [header-3](#header-3)
swagger-codegen generate -i https://your-devicehub.com/api/v1/swagger.json -l javascript -o ./devicehub-client  
```  

### Использование готового Python клиента

В репозитории уже есть готовый Python клиент:

```python  
from devicehub_client import AuthenticatedClient  
  
client = AuthenticatedClient(  
    base_url="https://your-devicehub.com",   
    token="your-access-token"  
)  
```

## Аутентификация

Для использования API необходим access token, который можно сгенерировать в UI DeviceHub в разделе Settings → Keys. Токен передается в заголовке Authorization:

```bash  
curl -H "Authorization: Bearer YOUR-TOKEN-HERE" https://devicehub.example.com/api/v1/autotests/captureDevices  
```

## Ограничения

Система автотестов в DeviceHub построена поверх обычной системы групп устройств, но предоставляет упрощенный API специально для CI/CD пайплайнов. Для обычных пользователей действует ограничение в 2 устройства одновременно.