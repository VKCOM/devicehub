import syrup from '@devicefarmer/stf-syrup'
import CDP from 'chrome-remote-interface'

export class CDPClient {

    /** @type {CDP.Client | undefined} */
    _client

    get client() {
        if (!this._client) {
            throw new Error('CDP client is not connected')
        }
        return this._client
    }

    connect = async(host, port) => {
        if (this._client) {
            return
        }

        // eslint-disable-next-line new-cap
        const list = await CDP.List({host, port})
        if (!list?.length || !list[0].id) {
            throw new Error('No CDP targets found')
        }

        /**
         * @type {CDP.Protocol}
         * @ts-ignore */
        const {default: protocol} = await import('./protocol.json', {assert: {type: 'json'}})

        // eslint-disable-next-line new-cap
        this._client = await CDP({target: `ws://${host}:${port}/devtools/page/${list[0].id}`, protocol})
        await Promise.all([
            this._client.Page.enable(),
            this._client.DOM.enable(),
            this._client.Runtime.enable()
        ])
    }

    getHTML = async() => {
        const {root: {nodeId}} = await this.client.DOM.getDocument()
        return (
            await this.client.DOM.getOuterHTML({nodeId})
        ).outerHTML
    }

    getAssetsList = async() => {
        const list = await this.client.Page.getResourceTree()
        return {
            frameId: list.frameTree.frame.id,
            assets: list.frameTree.resources
        }
    }

    getAsset = async(frameId, url) => {
        return await this.client.Page.getResourceContent({frameId, url})
    }

    close = async() => {
        await this._client?.close()
        delete this._client
    }
}
export default syrup.serial()
    .define(async(options) => new CDPClient())
