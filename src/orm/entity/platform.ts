import * as moment from 'moment';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
@Index(['platform', 'platform_user'], { unique: true })
export class Platform {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({
        type: 'char',
        length: 32,
    })
    @Index()
    public user: string;

    @Column({
        type: 'char',
        length: 32,
    })
    public secret: string;

    @Column({
        type: 'varchar',
        length: '255',
    })
    @Index()
    public platform: string;

    @Column({
        type: 'varchar',
        length: '255',
    })
    @Index()
    public platform_user: string;

    @Column({
        type: 'text',
    })
    public access_token: string;

    @Column({
        type: 'text',
    })
    public refresh_token: string;

    @Column({
        type: 'int',
        unsigned: true,
    })
    public expires_at: number;

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

    @Column({
        type: 'int',
        unsigned: true,
    })
    public deleted_at: number;
}

export default Platform;
