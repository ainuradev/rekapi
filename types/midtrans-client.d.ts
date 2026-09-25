declare module 'midtrans-client' {
    export class Snap {
        constructor(config: { isProduction: boolean; serverKey: string; clientKey: string })
        createTransaction(parameter: any): Promise<any>
    }

    export class CoreApi {
        constructor(config: { isProduction: boolean; serverKey: string; clientKey: string })
        charge(parameter: any): Promise<any>
        transaction: {
            status(transactionId: string): Promise<any>
            notification(notificationJson: any): Promise<any>
        }
    }
}
