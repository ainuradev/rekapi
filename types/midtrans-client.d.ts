declare module 'midtrans-client' {
    export class Snap {
        constructor(config: { isProduction: boolean; serverKey: string; clientKey: string })
        createTransaction(parameter: Record<string, unknown>): Promise<Record<string, unknown>>
    }

    export class CoreApi {
        constructor(config: { isProduction: boolean; serverKey: string; clientKey: string })
        charge(parameter: Record<string, unknown>): Promise<Record<string, unknown>>
        transaction: {
            status(transactionId: string): Promise<Record<string, unknown>>
            notification(notificationJson: Record<string, unknown>): Promise<Record<string, unknown>>
        }
    }
}
