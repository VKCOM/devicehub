# Архитектура
idb представляет собой эффективный инструмент для взаимодействия с iOS устройствами и iOS симуляторами, состоящий из двух основных компонентов: idb_cli и idb_companion.
Эти компоненты работают в тандеме для полноценного выполнения команд idb.

## Командная строка idb (idb_cli)
idb_cli — это интерфейс командной строки, написанный на основе Python 3, предоставляющий полный набор функций,
доступных в idb. его не обязательно запускать на Mac, к которому подключен ваш iPhone или iOS Simulator.
Командная строка выполняет роль тонкого клиента для idb_companion, взаимодействуя с ним через gRPC,
используя TCP или Unix Domain Socket в зависимости от конфигурации.
Вы можете встраивать эту библиотеку в свой код на Python 3 или использовать её в связке с другими инструментами автоматизации.

## idb_companion
idb_companion — это сервер, работающий на macOS и построенный на базе gRPC с использованием Objective-C++.
Он обеспечивает доступ к нативному API для автоматизации устройства и симуляторов iOS, управляя фреймворками FBSimulatorControl и FBDeviceControl, ключевыми частями проекта idb.
В режиме работы как gRPC сервер, idb_companion управляет одной iOS целью — устройством или симулятором.
Некоторые его функции остаются недоступными из командной строки, так как они предназначены для управления устройствами и сценариями работы и тестирования с iOS.

Внутри нашего проекта мы используем несколько ключевых возможностей idb, для нас, например:
- чтение логов - это позволяет собирать важные данные об использовании устройства и выявлять неполадки в работе приложения
- установка и удаление приложенией - это упрощает управление приложениями на устройствах или симуляторах.
- просмотр файлов устройства или эмулятора - это позволяет модифицировать и управлять файловой системой устройства или симулятора.

## Чтение логов
Для чтения логов мы используем команду
```
idb log --udid
```
Однако, есть пара важных аспектов, например,
- логи приходят в формате строки (string)
- логи приходят "кусочками" (чанками)

Чтобы получить логи в формате json можно использовать команду
```
idb log --udid -- --style json
```
В таком случае проблема недостающих кусочков-чанков может решаться через [библиотеку](https://www.npmjs.com/package/incomplete-json-parser)
В ином случае можно использовать библиотеку [nsyslog parser](https://www.npmjs.com/package/nsyslog-parser)
Более подробно можно изучить нашу реализацию в [файле](lib/units/ios-device/plugins/devicelog.js)

## Установка и удаление приложений

Получение списка приложений
```
idb list-apps
```

Выводит список установленных приложений на целевом устройстве и их метаданные, например:

- Идентификатор пакета (Bundle ID)
- Название
- Тип установки (пользовательское, системное)
- Архитектуры
- Статус выполнения
- Статус отладки

### Установка приложения

Чтобы установить приложение, выполните:

```
idb install /path/to/testApp.app
```

Устанавливает указанное .app или .ipa. Архитектура целевого приложения должна совпадать с архитектурой устройства.

### Запуск приложения

Запуск приложения осуществляется командой:

```
idb launch com.apple.Maps(пример приложения)
```

Любые переменные окружения, которые начинаются с префикса IDB_, будут установлены в запущенном приложении с удалением этого префикса.

Пользовательские аргументы запуска также могут быть запущены, при добавлении их в конец команды.

По умолчанию команда idb launch завершится неудачей, если приложение уже запущено; это можно изменить с помощью флага -f/--foreground-if-running.

С флагом -w/--wait-for можно отслеживать вывод работы приложения, принимая стандартные потоки вывода и ошибок, остановка происходит при SIGTERM, например, с помощью ^C.
Завершение работы запущенного приложения

Приложение можно завершить, используя:


```
idb terminate com.apple.Maps
```

Завершает работу приложения с указанным идентификатором пакета (Bundle ID). Если приложение не запущено или приложение с указанным идентификатором пакета не установлено, операция завершится неудачей.

### Удаление приложения
Для удаления выполните:

```
idb uninstall com.foo.bar
```

Удаляет приложение с целевого устройства по идентификатору пакета (Bundle ID).

## Просмотр файлов

Просмотреть файлы можно командой:

```
idb file list --%target%
```
Чтобы получить в виде json
```
idb file list --%target% --json
```
### Контейнеры файлов

idb позволяет манипулировать файлами или "похожими на файлы" сущностями на iOS-целях.

### Контейнеры файлов (или %target%)

"Контейнер файлов" представляет собой представление iOS-цели, которое ведет себя как удаленная или смонтированная файловая система.
Файлы, представленные в iOS контейнере, могут быть изменены одинаково, независимо от типа контейнера, для обеспечения согласованности функциональности между ними.
iOS Симуляторы и iOS Устройства поддерживают различные виды контейнеров, а также контейнеры, общие как для Симуляторов, так и для физических устройств.

В таблице ниже перечислены все доступные контейнеры и на какие iOS-цели они применяются:

| Тип контейнера          | Описание контейнера                                                                                                                        | Симуляторы | Физические устройства                     |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------|
| --application           | Все установленные пакеты в "Песочнице приложений". Это идентификаторы пакетов, соответствующие домашним каталогам установленных приложений | ✅          | ✅ (при установке с профилем разработчика) |
| --crashes               | Отчеты о сбоях/диагностике. Может использоваться для просмотра и извлечения логов сбоев с устройства                                       | ❌          | ✅                                         |
| --disk-images           | Образы дисков разработчика                                                                                                                 | ❌          | ✅                                         |
| --group                 | Это общие директории между приложениями, которые имеют префикс с обратными доменными идентификаторами (например, 'group.com.apple.safari') | ✅          | ❌                                         |
| --mdm-profiles          | Установленные MDM профили                                                                                                                  | ❌          | ✅                                         |
| --media                 | Фотографии и видео устройства                                                                                                              | ✅          | ✅                                         |
| --provisioning-profiles | Установленные provision profilies конфигурации на устройстве                                                                               | ❌          | ✅                                         |
| --root                  | Корневая файловая система устройства или симулятора.                                                                                       | ✅          | ❌                                         |
| --springboard-icons     | Макет элементов на домашнем экране                                                                                                         | ❌          | ✅                                         |
| --wallpaper             | Обои, установленные на устройстве                                                                                                          | ❌          | ✅                                         |

### Операции с файлами

Все операции с контейнером файлов выполняются относительно некоторого "корня".
Что представляет собой этот корень, будет варьироваться в зависимости от указанного типа контейнера.
Например, контейнер --application представит корень с подкаталогами для "Контейнеров приложений" установленных приложений.
Контейнер --disk-images представляет корень со всеми монтируемыми "Образами дисков разработчика", а также каталог, представляющий в данный момент смонтированный образ диска.

### Копирование файлов в контейнер
Для копирования файлов в контейнер используйте:

```bash
idb file push --application com.foo.bar/src1.jpg com.foo.bar/src2.jpg dest_1
