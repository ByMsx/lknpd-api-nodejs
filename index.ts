import fetch from 'cross-fetch';

interface NalogAPIParamsAutologin {
  login: string;
  password: string;
  autologin: true;
}

interface NalogAPIParamsNoLogin {
  autologin: false;
}

export interface AuthInfo {
  inn: string;
  token: string;
  refreshToken: string;
  tokenExpiresIn: string;
  deviceId: string;
}

export type NalogAPIParams = Partial<(NalogAPIParamsAutologin | NalogAPIParamsNoLogin) & AuthInfo>;

interface IncomeCommon {
  date?: Date;
}

export interface AddIncomeParams extends IncomeCommon {
  name: string;
  quantity?: number;
  amount: number;
}

export interface AddMultipleIncomeParams extends IncomeCommon {
  services: Array<{ name: string; quantity?: number; amount: number }>;
}

export interface AddIncomeResult {
  id: string;
  approvedReceiptUuid: string;
  jsonUrl: string;
  printUrl: string;
  data: unknown;
}

export interface ErrorResponse {
  error: string;
}

function isMultipleIncomeParams(
  arg0: AddIncomeParams | AddMultipleIncomeParams,
): arg0 is AddMultipleIncomeParams {
  return !!(arg0 as AddMultipleIncomeParams).services;
}

export default class NalogAPI {
  private readonly apiUrl = 'https://lknpd.nalog.ru/api/v1';
  private readonly sourceDeviceId: string;

  private authPromise: Promise<unknown> | null;
  private token?: string;
  private refreshToken?: string;
  private tokenExpireIn?: string;

  private inn: string;

  constructor(params: NalogAPIParams) {
    this.inn = params.inn;
    this.token = params.token;
    this.refreshToken = params.refreshToken;
    this.tokenExpireIn = params.tokenExpiresIn;
    this.sourceDeviceId = params.deviceId ?? this.createDeviceId();
    this.authPromise = null;

    if (params.autologin) {
      this.auth(params.login, params.password);
    }
  }

  /**
   * Генерирует 21 символьный идентификатор "устройства" требующийся для авторизации
   */
  createDeviceId() {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  getAuthInfo(): AuthInfo {
    if (!this.token || !this.refreshToken || !this.tokenExpireIn) {
      throw new Error('Missing auth information');
    }

    return {
      token: this.token,
      refreshToken: this.refreshToken,
      tokenExpiresIn: this.tokenExpireIn,
      deviceId: this.sourceDeviceId,
    };
  }

  auth(login: string, password: string) {
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = fetch(this.apiUrl + '/auth/lkfl', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
      },
      referrer: 'https://lknpd.nalog.ru/',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: JSON.stringify({
        username: login,
        password: password,
        deviceInfo: {
          sourceDeviceId: this.sourceDeviceId,
          sourceType: 'WEB',
          appVersion: '1.0.0',
          metaDetails: {
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.192 Safari/537.36',
          },
        },
      }),
    })
      .then(r => r.json())
      .then(response => {
        if (!response.refreshToken) {
          throw new Error(response.message || 'Не получилось авторизоваться');
        }
        this.inn = response.profile.inn;
        this.token = response.token;
        this.tokenExpireIn = response.tokenExpireIn;
        this.refreshToken = response.refreshToken;
        return response;
      })
      .catch(err => {
        throw err;
      });

    return this.authPromise;
  }

  async requestSmsCode(phone: string) {
    const smsRequest = await fetch(this.apiUrl + '/auth/challenge/sms/start', {
      // todo: here should be api/v1/
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
      },
      referrer: 'https://lknpd.nalog.ru/',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: JSON.stringify({
        phone,
        requireTpToBeActive: true,
      }),
    });

    const { challengeToken } = await smsRequest.json();
    return { challengeToken, phone, deviceId: this.sourceDeviceId };
  }

  async authViaSmsCode(code: string, challengeToken: string, phone: string) {
    await fetch(this.apiUrl + '/auth/challenge/sms/verify', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
      },
      referrer: 'https://lknpd.nalog.ru/',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: JSON.stringify({
        challengeToken,
        phone,
        code,
        deviceInfo: {
          sourceDeviceId: this.sourceDeviceId,
          sourceType: 'WEB',
          appVersion: '1.0.0',
          metaDetails: {
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.192 Safari/537.36',
          },
        },
      }),
    })
      .then(r => r.json())
      .then(response => {
        if (!response.refreshToken) {
          throw new Error(response.message || 'Не получилось авторизоваться');
        }
        this.inn = response.profile.inn;
        this.token = response.token;
        this.tokenExpireIn = response.tokenExpireIn;
        this.refreshToken = response.refreshToken;
        return response;
      })
      .catch(err => {
        throw err;
      });
  }

  async getToken() {
    if (
      this.token &&
      this.tokenExpireIn &&
      new Date().getTime() + 60 * 1000 < new Date(this.tokenExpireIn).getTime()
    ) {
      return this.token;
    }

    if (!this.token || !this.refreshToken) {
      throw new Error('Необходимо сначала авторизоваться');
    }

    const tokenPayload = {
      deviceInfo: {
        appVersion: '1.0.0',
        sourceDeviceId: this.sourceDeviceId,
        sourceType: 'WEB',
        metaDetails: {
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.192 Safari/537.36',
        },
      },
      refreshToken: this.refreshToken,
    };

    const response = await fetch(this.apiUrl + '/auth/token', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
      },
      referrer: 'https://lknpd.nalog.ru/sales',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: JSON.stringify(tokenPayload),
    })
      .then(r => r.json())
      .catch(console.error);

    if (response.refreshToken) {
      this.refreshToken = response.refreshToken;
    }

    this.token = response.token;
    this.tokenExpireIn = response.tokenExpireIn;

    return this.token;
  }

  async call(endpoint, payload?, method = 'GET') {
    if (payload) {
      method = 'POST';
    }

    const params = {
      method: method,
      headers: {
        authorization: 'Bearer ' + (await this.getToken()),
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
      },
      referrer: 'https://lknpd.nalog.ru/sales/create',
      referrerPolicy: 'strict-origin-when-cross-origin' as ReferrerPolicy,
      body: JSON.stringify(payload),
    };

    if (method === 'GET') delete params.body;

    return fetch(this.apiUrl + '/' + endpoint, params).then(r => r.json());
  }

  async addIncome(params: AddIncomeParams | AddMultipleIncomeParams): Promise<AddIncomeResult> {
    let services;

    if (!isMultipleIncomeParams(params)) {
      const { amount, quantity, name } = params;
      services = [
        {
          name, // 'Предоставление информационных услуг #970/2495',
          amount: Number(amount.toFixed(2)),
          quantity: Number(quantity),
        },
      ];
    } else {
      services = params.services;
    }

    const date = params.date || new Date();

    const totalAmount = services
      .reduce((sum, service) => sum + service.amount * service.quantity, 0)
      .toFixed(2);

    const response = await this.call('income', {
      paymentType: 'CASH',
      ignoreMaxTotalIncomeRestriction: false,
      client: { contactPhone: null, displayName: null, incomeType: 'FROM_INDIVIDUAL', inn: null },

      requestTime: this.dateToLocalISO(),
      operationTime: this.dateToLocalISO(date),

      services,
      totalAmount,
    });

    if (!response || !response.approvedReceiptUuid) {
      throw new Error(response);
    }

    const result = {
      id: response.approvedReceiptUuid,
      approvedReceiptUuid: response.approvedReceiptUuid,
      jsonUrl: `${this.apiUrl}/receipt/${this.inn}/${response.approvedReceiptUuid}/json`,
      printUrl: `${this.apiUrl}/receipt/${this.inn}/${response.approvedReceiptUuid}/print`,
    };

    (result as AddIncomeResult).data = await fetch(result.jsonUrl).then(v => v.json());

    return result as AddIncomeResult;
  }

  userInfo() {
    return this.call('user');
  }

  dateToLocalISO(date = new Date()) {
    date = new Date(date);
    const off = date.getTimezoneOffset();
    const absoff = Math.abs(off);
    return (
      new Date(date.getTime() - off * 60 * 1000).toISOString().substr(0, 19) +
      (off > 0 ? '-' : '+') +
      (absoff / 60).toFixed(0).padStart(2, '0') +
      ':' +
      (absoff % 60).toString().padStart(2, '0')
    );
  }
}
