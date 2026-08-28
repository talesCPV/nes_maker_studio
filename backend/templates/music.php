<?php
/**
 * NGC Stage 16 - Music / APU.
 * Converte o mesmo formato usado pelo editor de som nas tabelas do runtime NES.
 */
return [
    'music' => static function(array $ctx): string {
        $music = $ctx['music'] ?? null;
        if (!is_array($music) || empty($music['channels'])) return '';

        $baseFrames = max(1, min(255, (int)($music['baseFrames'] ?? 30)));
        $loop = ($music['loop'] ?? true) !== false;
        $channels = is_array($music['channels']) ? $music['channels'] : [];
        $order = ['pulse1','pulse2','triangle','noise'];
        $used = [];

        foreach ($order as $type) {
            foreach ($channels as $ch) {
                if (is_array($ch) && ($ch['type'] ?? '') === $type) {
                    $used[] = ['type'=>$type, 'ch'=>$ch];
                    break;
                }
            }
        }
        foreach ($channels as $ch) {
            if (!is_array($ch)) continue;
            $type = (string)($ch['type'] ?? '');
            $already = false;
            foreach ($used as $u) if ($u['ch'] === $ch) { $already=true; break; }
            if ($already) continue;
            $free = null;
            foreach ($order as $candidate) {
                $taken = false;
                foreach ($used as $u) if ($u['type'] === $candidate) { $taken=true; break; }
                if (!$taken) { $free=$candidate; break; }
            }
            if ($free !== null) $used[] = ['type'=>$free, 'ch'=>$ch];
        }
        $used = array_slice($used, 0, 4);
        if (!$used) return '';

        $meta = [
            'pulse1'=>['vol'=>'$4000','lo'=>'$4002','hi'=>'$4003','duty'=>'#%10111111','sil'=>'#%00110000'],
            'pulse2'=>['vol'=>'$4004','lo'=>'$4006','hi'=>'$4007','duty'=>'#%01111111','sil'=>'#%00110000'],
            'triangle'=>['vol'=>'$4008','lo'=>'$400A','hi'=>'$400B','duty'=>'#%11111111','sil'=>'#%00000000'],
            'noise'=>['vol'=>'$400C','lo'=>'$400E','hi'=>'$400F','duty'=>'#%00111111','sil'=>'#%00110000'],
        ];
        $rhythm = ['breve'=>4,'whole'=>2,'quarter'=>1,'eighth'=>0.5,'sixteenth'=>0.25,'thirtysecond'=>0.125,'sixtyfourth'=>0.0625];
        $noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        $freq = 1789773;
        $enc=[];
        foreach ($used as $i=>$u) {
            $notes = is_array($u['ch']['notes'] ?? null) ? $u['ch']['notes'] : [];
            $pitchList=['REST']; $pitchIndex=['REST'=>0]; $scale=[]; $time=[];
            $n=min(count($notes),2048);
            for($j=0;$j<$n;$j++) {
                $note=(string)($notes[$j]['note'] ?? 'REST');
                $fig=(string)($notes[$j]['figure'] ?? 'quarter');
                if(!array_key_exists($note,$pitchIndex)) { $pitchIndex[$note]=count($pitchList); $pitchList[]=$note; }
                $scale[]=$pitchIndex[$note];
                $mul=$rhythm[$fig] ?? 1;
                $time[]=max(1,min(255,(int)round($baseFrames*$mul)));
            }
            if(!$scale){$scale=[0];$time=[30];}
            $scale[]=$loop?0xFF:0xFE;
            $lo=[];$hi=[];
            foreach($pitchList as $name){
                $l=0;$h=0;
                if(preg_match('/^([A-G]#?)(\\d+)$/',$name,$m)){
                    $ni=array_search($m[1],$noteNames,true);
                    if($ni!==false){
                        $oct=(int)$m[2]; $midi=($oct+1)*12+$ni;
                        $f=440*pow(2,($midi-69)/12);
                        $period=(int)round(($freq/(16*$f))-1);
                        $period=max(0,min(2047,$period));
                        $l=$period&255;$h=($period>>8)&7;
                    }
                }
                $lo[]=$l;$hi[]=$h;
            }
            $enc[]=['type'=>$u['type'],'lo'=>$lo,'hi'=>$hi,'scale'=>$scale,'time'=>$time,'meta'=>$meta[$u['type']]];
        }

        $fmt=static function(array $a): string {
            $lines=[]; for($i=0;$i<count($a);$i+=16){
                $part=array_slice($a,$i,16); $lines[]='  .byte '.implode(', ',array_map(static fn($v)=>sprintf('$%02X',$v&255),$part));
            } return implode("\n",$lines);
        };
        $L=[];
        $L[]='; ---- NGC MUSIC / APU ----';
        $L[]='music_update:';
        $L[]='  LDA music_on';
        $L[]='  BNE mu_run';
        $L[]='  RTS';
        $L[]='mu_run:';
        foreach($enc as $i=>$c){
            $m=$c['meta'];$p="mu_ch{$i}";
            $L[]="{$p}:";
            $L[]="  LDA ch{$i}_timer"; $L[]="  BEQ {$p}_next"; $L[]="  DEC ch{$i}_timer"; $L[]="  JMP {$p}_end";
            $L[]="{$p}_next:"; $L[]="  LDY ch{$i}_pos"; $L[]="  LDA Scale_ch{$i},Y"; $L[]='  CMP #$FF'; $L[]="  BNE {$p}_nof";
            $L[]='  LDA #0';$L[]="  STA ch{$i}_pos";$L[]='  LDY #0';$L[]="  LDA Scale_ch{$i},Y";
            $L[]="{$p}_nof:";$L[]='  CMP #$FE';$L[]="  BNE {$p}_play";$L[]="  LDA {$m['sil']}";$L[]="  STA {$m['vol']}";$L[]="  JMP {$p}_end";
            $L[]="{$p}_play:";$L[]='  TAX';$L[]="  LDA Time_ch{$i},Y";$L[]="  STA ch{$i}_timer";$L[]='  INY';$L[]="  STY ch{$i}_pos";$L[]='  CPX #0';$L[]="  BNE {$p}_tone";
            $L[]="  LDA {$m['sil']}";$L[]="  STA {$m['vol']}";$L[]="  JMP {$p}_end";
            $L[]="{$p}_tone:";$L[]="  LDA {$m['duty']}";$L[]="  STA {$m['vol']}";$L[]="  LDA PitchLo_ch{$i},X";$L[]="  STA {$m['lo']}";$L[]="  LDA PitchHi_ch{$i},X";$L[]="  STA {$m['hi']}";$L[]="{$p}_end:";
        }
        $L[]='  RTS';$L[]='';$L[]='music_init:';$L[]='  LDA #0';
        foreach($enc as $i=>$c){
            $L[]='  LDA #0';
            $L[]="  STA ch{$i}_timer";
            $L[]="  STA ch{$i}_pos";
            $L[]="  STA ch{$i}_timer";
            $L[]="  STA ch{$i}_pos";
        }
        $L[]='  LDA #$0F';$L[]='  STA $4015';$L[]='  LDA #1';$L[]='  STA music_on';$L[]='  RTS';$L[]='';
        $L[]='; ---- NGC MUSIC DATA ----';
        foreach($enc as $i=>$c){
            $L[]="PitchLo_ch{$i}:";$L[]=$fmt($c['lo']);
            $L[]="PitchHi_ch{$i}:";$L[]=$fmt($c['hi']);
            $L[]="Scale_ch{$i}:";$L[]=$fmt($c['scale']);
            $L[]="Time_ch{$i}:";$L[]=$fmt($c['time']);$L[]='';
        }
        return implode("\n",$L);
    }
];
