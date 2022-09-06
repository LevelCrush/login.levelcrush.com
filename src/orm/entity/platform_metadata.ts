import * as moment from 'moment';
import { Entity, Column, PrimaryGeneratedColumn, Index, Table } from 'typeorm';

@Entity('platform_metadata')
@Index(['platform_user', 'key'], { unique: true })
export class PlatformMetadata {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({
        type: 'varchar',
        length: '255',
    })
    @Index()
    public platform: string;

    @Column({
        type: 'varchar',
        length: '512',
    })
    @Index()
    public platform_user: string;

    @Index()
    @Column({
        type: 'varchar',
        length: '255',
    })
    public key: string;

    @Column({
        type: 'text',
    })
    public value: string;

    @Column({
        type: 'int',
        unsigned: true,
    })
    public created_at: number;

    @Column({
        type: 'int',
        unsigned: true,
    })
    public updated_at: number;
}

export default PlatformMetadata;
