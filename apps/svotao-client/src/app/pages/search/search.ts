import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { provideTablerIcons, TablerIconComponent } from 'angular-tabler-icons';
import {
  IconBarcode,
  IconChevronRight,
  IconEdit,
  IconTrash,
} from 'angular-tabler-icons/icons';
import { BehaviorSubject } from 'rxjs';
import { LiquidGlassContainer } from '../../components/liquid-glass-container/liquid-glass-container';

@Component({
  selector: 'svotao-search',
  imports: [CommonModule, LiquidGlassContainer, TablerIconComponent],
  providers: [
    provideTablerIcons({
      IconBarcode,
      IconChevronRight,
      IconTrash,
      IconEdit,
    }),
  ],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search {
  public ingredients$ = new BehaviorSubject([
    {
      name: 'Tomato',
      thumb: 'https://picsum.photos/200/300',
    },
    {
      name: 'Onion',
      thumb: 'https://picsum.photos/200/300',
    },
    {
      name: 'Garlic',
      thumb: 'https://picsum.photos/200/300',
    },
  ]);
}
