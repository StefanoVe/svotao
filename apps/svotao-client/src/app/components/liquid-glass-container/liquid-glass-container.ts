import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'svotao-liquid-glass',
  imports: [CommonModule],
  templateUrl: './liquid-glass-container.html',
  styleUrl: './liquid-glass-container.css',
})
export class LiquidGlassContainer {
  @Input() containerClass = '';
  @Input() type: 'item' | 'host' | 'card' = 'host';
  @Input() selected = false;

  public get lqClasses(): string {
    let baseClasses = `liquid-glass lq-${this.type}`;

    if (this.selected && this.type === 'item') {
      baseClasses += ' lqi-selected';
    }
    return baseClasses + ' ' + this.containerClass;
  }
}
