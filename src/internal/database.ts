import { Context } from "koishi";

declare module 'koishi' {
    interface Tables {
        sleep_manage_stats: SleepManegeStats
    }
    interface User {
        lastGreetingTime: number
        eveningCount: number
    }
    interface Channel {
        eveningRank: string[]
        morningRank: string[]
    }
}

export class SleepDatabase {
    constructor(app: Context) {
        app.model.extend('user', {
            lastGreetingTime: 'integer(14)',
            eveningCount: 'integer(3)'
        })

        app.model.extend('channel', {
            morningRank: 'list',
            eveningRank: 'list'
        })

        app.model.extend('sleep_manage_stats', {
            id: 'unsigned',
            uid: 'unsigned',
            morningAt: 'integer(14)',
            eveningAt: 'integer(14)',
            eveningManyCount: 'integer(3)',
            lieMessageCount: 'integer(5)'
        })
    }
}

export interface SleepManegeStats {
    id: number,
    uid: number
    morningAt: number
    eveningAt: number
    eveningManyCount: number
    lieMessageCount: number
}
