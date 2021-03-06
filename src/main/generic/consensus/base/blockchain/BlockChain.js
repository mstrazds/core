class BlockChain {
    /**
     * @param {BlockChain} chain1
     * @param {BlockChain} chain2
     * @returns {BlockChain}
     */
    static merge(chain1, chain2) {
        const merged = [];
        let i1 = 0, i2 = 0;
        while (i1 < chain1.length && i2 < chain2.length) {
            const block1 = chain1.blocks[i1];
            const block2 = chain2.blocks[i2];

            if (block1.height === block2.height) {
                Assert.that(block1.equals(block2), 'Encountered different blocks at same height during chain merge');
                merged.push(block1);
                i1++;
                i2++;
            } else if (block1.height < block2.height) {
                merged.push(block1);
                i1++;
            } else {
                merged.push(block2);
                i2++;
            }
        }

        for (; i1 < chain1.length; i1++) {
            merged.push(chain1.blocks[i1]);
        }
        for (; i2 < chain2.length; i2++) {
            merged.push(chain2.blocks[i2]);
        }

        return new BlockChain(merged);
    }

    /**
     * @param {BlockChain} chain1
     * @param {BlockChain} chain2
     * @returns {?Block}
     */
    static lowestCommonAncestor(chain1, chain2) {
        let i1 = chain1.length - 1;
        let i2 = chain2.length - 1;
        while (i1 >= 0 && i2 >= 0) {
            const block1 = chain1.blocks[i1];
            const block2 = chain2.blocks[i2];

            if (block1.equals(block2)) {
                return block1;
            } else if (block1.height > block2.height) {
                i1--;
            } else {
                i2--;
            }
        }
        return undefined;
    }

    /**
     * @param {Array.<Block>} blocks
     */
    constructor(blocks) {
        if (!blocks || !NumberUtils.isUint16(blocks.length)
            || blocks.some(it => !(it instanceof Block) || !it.isLight())) throw new Error('Malformed blocks');

        /** @type {Array.<Block>} */
        this._blocks = blocks;
    }

    /**
     * @param {SerialBuffer} buf
     * @returns {BlockChain}
     */
    static unserialize(buf) {
        const count = buf.readUint16();
        const blocks = [];
        for (let i = 0; i < count; i++) {
            const header = BlockHeader.unserialize(buf);
            let interlink = BlockInterlink.unserialize(buf);
            // FIXME: Remove for mainnet.
            if (header.version === BlockHeader.Version.LUNA_V1) {
                interlink = new BlockInterlinkLegacy(interlink.hashes);
            }
            blocks.push(new Block(header, interlink));
        }
        return new BlockChain(blocks);
    }

    /**
     * @param {SerialBuffer} [buf]
     * @returns {SerialBuffer}
     */
    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        buf.writeUint16(this._blocks.length);
        for (const block of this._blocks) {
            block.header.serialize(buf);
            // FIXME: Remove for mainnet.
            if (block.version === BlockHeader.Version.LUNA_V1) {
                (new BlockInterlink(block.interlink.hashes)).serialize(buf);
            } else {
                block.interlink.serialize(buf);
            }
        }
        return buf;
    }

    /** @type {number} */
    get serializedSize() {
        return /*count*/ 2
            + this._blocks.reduce((sum, block) => {
                let size = block.serializedSize;
                if (block.version === BlockHeader.Version.LUNA_V1) {
                    size += (new BlockInterlink(block.interlink.hashes)).serializedSize - block.interlink.serializedSize;
                }
                return sum + size;
            }, 0);
    }

    /**
     * @returns {Promise.<boolean>}
     */
    async verify() {
        // For performance reasons, we DO NOT VERIFY the validity of the blocks in the chain here.
        // Block validity is checked by the Nano/LightChain upon receipt of a ChainProof.

        // Check that all blocks in the chain are valid successors of one another.
        for (let i = this._blocks.length - 1; i >= 1; i--) {
            if (!(await this._blocks[i].isSuccessorOf(this._blocks[i - 1]))) { // eslint-disable-line no-await-in-loop
                return false;
            }
        }

        // Everything checks out.
        return true;
    }

    /**
     * @returns {Promise.<boolean>}
     */
    async isDense() {
        for (let i = this._blocks.length - 1; i >= 1; i--) {
            const prevHash = await this._blocks[i - 1].hash(); // eslint-disable-line no-await-in-loop
            if (!prevHash.equals(this._blocks[i].prevHash)) {
                return false;
            }
        }
        return true;
    }

    /**
     * @returns {Promise.<Array.<Block>>}
     */
    async denseSuffix() {
        // Compute the dense suffix.
        const denseSuffix = [this.head];
        let denseSuffixHead = this.head;
        for (let i = this.length - 2; i >= 0; i--) {
            const block = this.blocks[i];
            const hash = await block.hash();
            if (!hash.equals(denseSuffixHead.prevHash)) {
                break;
            }

            denseSuffix.push(block);
            denseSuffixHead = block;
        }
        denseSuffix.reverse();
        return denseSuffix;
    }

    /**
     * @returns {Promise.<boolean>}
     */
    async isAnchored() {
        return Block.GENESIS.HASH.equals(await this.tail.hash());
    }

    /**
     * @returns {string}
     */
    toString() {
        return `BlockChain{length=${this.length}}`;
    }

    /** @type {number} */
    get length() {
        return this._blocks.length;
    }

    /** @type {Array.<Block>} */
    get blocks() {
        return this._blocks;
    }

    /** @type {Block} */
    get head() {
        return this._blocks[this.length - 1];
    }

    /** @type {Block} */
    get tail() {
        return this._blocks[0];
    }

    /**
     * @returns {number}
     */
    totalDifficulty() {
        return this._blocks.reduce((sum, block) => sum + BlockUtils.targetToDifficulty(block.target), 0);
    }
}
Class.register(BlockChain);
