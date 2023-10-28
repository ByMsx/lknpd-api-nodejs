# Создание чеков в налоговой
Неофициальная обёртка для API сервиса lknpd.nalog.ru на nodejs.

Служит для автоматизации отправки информации о доходах самозанятых и получения информации о созданных чеках.

## Использование
Установите пакет
```bash
npm i lknpd-api
```


Инициализаци и авторизация
```javascript
import NalogAPI from 'lknpd-api';

const nalogAPI = new NalogApi({ username:'23456789', password: 'your_pass' })
```

Также возможна авторизация по SMS
```typescript
import input from 'input'; // не забудьте установить пакет
import NalogAPI from 'lknpd-api';

const phone = '79991234567';
const nalogApi = new NalogApi({ autologin: false });

const { challengeToken } = await nalogApi.requestSmsCode(phone);
await nalogApi.authViaSmsCode(code, challengeToken, phone);

```

Отправка информации о доходе
```javascript
nalogAPI.addIncome({ name:'Предоставление информационных услуг', amount: 99.99 }).then( receipt => {
  console.log(receipt.id, receipt.data)

  // ссылка на картинку с чеком
  return receipt.printUrl
}).catch(console.error)
```

### Примеры
Вызов произвольного метода api (см. network в devtools на сайте lknpd.nalog.ru)
```javascript
const stats = await nalogAPI.call('incomes/summary').catch(console.error)
```

Пример расширенного добавления дохода
```javascript
  const response = await nalogAPI.call('income', {
    paymentType: 'CASH',
    inn: null,
    ignoreMaxTotalIncomeRestriction: false,
    client: { contactPhone: null, displayName: null, incomeType: 'FROM_INDIVIDUAL' },

    requestTime: nalogAPI.dateToLocalISO(),
    operationTime: nalogAPI.dateToLocalISO(new Date('2021-03-08 12:42')),

    services: [{
      name: 'Предоставление информационных услуг #' + orderId,
      amount: 99.99,
      quantity: 1
    }],

    totalAmount: 99.99
  }).catch(console.error)

  console.log(response)

```


[Подробное описание методов класса](/docs/nalogAPIClass.md)


## Донаты
Если вам помогла эта библиотка можете [пожертвовать автору немного денег](https://yoomoney.ru/to/41001265749624  )


